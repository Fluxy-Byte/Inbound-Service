import type { Channel } from "amqplib";
import type { MetaContact, MetaMessage } from "../../domain/meta-webhook";
import { prisma } from "../../infrastructure/database/prisma/client";
import {
  publishJson,
  QUEUE_DESK_MESSAGE_INBOUND,
  QUEUE_OUTBOUND_MESSAGE_SEND,
  resolveAgentQueueName,
} from "../../infrastructure/queue/rabbitmq/publisher";
import { isMessageAlreadyProcessed, markMessageProcessed } from "./dedup-service";
import { popDebounceWindow, pushToDebounceWindow } from "./debounce-service";
import { mapMetaMessageType } from "./message-type-mapper";
import { resolveOrCreateMessagingSession } from "./messaging-session-service";
import { saveInboundMessage } from "./mongo-message-service";
import { isSessionProcessing, markSessionProcessing } from "./processing-state-service";
import { resolveOrCreateTarget, resolveWhatsappChannel } from "./target-service";

function agentPayload(agent: {
  id: string;
  name: string;
  processingMessage: string;
  transferMessage: string;
  unsupportedFormatMessage: string;
  outOfHoursMessage: string;
  outOfHoursEnabled: boolean;
  closingMessage: string;
  closingEnabled: boolean;
  errorMessage: string;
  errorEnabled: boolean;
  defaultQueueId: string | null;
  personality: string | null;
  ragEnabled: boolean;
}) {
  return {
    id: agent.id,
    name: agent.name,
    processingMessage: agent.processingMessage,
    transferMessage: agent.transferMessage,
    unsupportedFormatMessage: agent.unsupportedFormatMessage,
    outOfHoursMessage: agent.outOfHoursMessage,
    outOfHoursEnabled: agent.outOfHoursEnabled,
    closingMessage: agent.closingMessage,
    closingEnabled: agent.closingEnabled,
    errorMessage: agent.errorMessage,
    errorEnabled: agent.errorEnabled,
    defaultQueueId: agent.defaultQueueId,
    // Só consumidos pelo worker "max" — atlas/axel ignoram, já que têm
    // personalidade/RAG fixos em código.
    personality: agent.personality,
    ragEnabled: agent.ragEnabled,
  };
}

export async function handleInboundMessage(
  channel: Channel,
  phoneNumberId: string,
  message: MetaMessage,
  contact: MetaContact | undefined,
): Promise<void> {
  if (await isMessageAlreadyProcessed(message.id)) {
    console.log(`Mensagem duplicada ignorada: ${message.id}`);
    return;
  }

  const whatsappChannel = await resolveWhatsappChannel(phoneNumberId);
  if (!whatsappChannel) {
    console.warn(`Mensagem recebida para phoneNumberId não cadastrado: ${phoneNumberId}`);
    return;
  }

  // whatsappChannelId aqui é sempre o id interno (nunca o phoneNumberId da
  // Meta) — só dá pra saber depois de resolver o canal, por isso o registro
  // definitivo de dedup acontece aqui, não antes.
  if (await markMessageProcessed(message.id, whatsappChannel.id)) {
    console.log(`Mensagem duplicada ignorada (corrida concorrente): ${message.id}`);
    return;
  }

  const target = await resolveOrCreateTarget({
    organizationId: whatsappChannel.organizationId,
    whatsappChannelId: whatsappChannel.id,
    waId: contact?.wa_id ?? message.from,
    name: contact?.profile?.name,
  });

  const messageType = mapMetaMessageType(message.type);
  const text = message.type === "text" ? (message.text?.body ?? "") : "";

  // Resolve a sessão ANTES de gravar no Mongo — o documento precisa do
  // messagingSessionId final desde a criação, sem update pontual depois.
  const messagingSession = await resolveOrCreateMessagingSession({
    targetId: target.id,
    whatsappChannelId: whatsappChannel.id,
  });

  const mongoMessageId = await saveInboundMessage({
    organizationId: whatsappChannel.organizationId,
    targetId: target.id,
    whatsappChannelId: whatsappChannel.id,
    messagingSessionId: messagingSession.id,
    messageType,
    externalMessageId: message.id,
    text,
  });

  const targetPayload = { id: target.id, waId: target.waId, name: target.name, metadata: target.metadata };
  const whatsappChannelPayload = {
    id: whatsappChannel.id,
    phoneNumberId: whatsappChannel.phoneNumberId,
    wabaId: whatsappChannel.wabaId,
    serviceIslandId: whatsappChannel.serviceIsland?.id ?? null,
  };
  const messagingSessionPayload = { id: messagingSession.id, startedAt: messagingSession.startedAt };

  if (target.status === "HUMAN") {
    console.log(`[DESK-MSG][webhook-service] targetId=${target.id} status=HUMAN — roteando para desk.message.inbound`);
    await publishJson(channel, QUEUE_DESK_MESSAGE_INBOUND, {
      target: targetPayload,
      whatsappChannel: whatsappChannelPayload,
      messagingSession: messagingSessionPayload,
      agent: { id: whatsappChannel.agent.id, name: whatsappChannel.agent.name },
      message: { mongoMessageId, externalMessageId: message.id, type: messageType, text, timestamp: message.timestamp },
    });
    return;
  }

  // "AI" e "FINISHED" seguem para o pipeline de IA — não existe ainda regra de
  // produto para reengajamento automático de uma conversa "FINISHED" (mesmo
  // gap do sistema deprecado), então tratamos igual a "AI" por ora.
  if (message.type !== "text") {
    await markSessionProcessing(messagingSession.id);
    await publishJson(channel, resolveAgentQueueName(whatsappChannel.agent.name), {
      target: targetPayload,
      whatsappChannel: whatsappChannelPayload,
      agent: agentPayload(whatsappChannel.agent),
      messagingSession: messagingSessionPayload,
      messages: [{ mongoMessageId, externalMessageId: message.id, type: messageType, text, timestamp: message.timestamp }],
    });
    return;
  }

  const { isFirstInWindow } = await pushToDebounceWindow(messagingSession.id, {
    mongoMessageId,
    externalMessageId: message.id,
    type: "TEXT",
    text,
    timestamp: message.timestamp,
  });

  // processingMessage só faz sentido como aviso de "cheguei em cima de algo
  // que já está rodando" — só dispara se (a) esta mensagem abre uma janela de
  // agrupamento nova E (b) já existe um lote anterior daquela sessão em
  // processamento no AI-Worker. Mensagem de abertura de conversa (ou
  // qualquer turno sem sobreposição) não deve gerar esse aviso.
  if (isFirstInWindow && (await isSessionProcessing(messagingSession.id))) {
    console.log(
      `[DESK-MSG][webhook-service] targetId=${target.id} status=${target.status} sessão em processamento — enviando processingMessage`,
    );
    await publishJson(channel, QUEUE_OUTBOUND_MESSAGE_SEND, {
      target: targetPayload,
      whatsappChannel: whatsappChannelPayload,
      messagingSession: messagingSessionPayload,
      answer: { text: whatsappChannel.agent.processingMessage, audio: "", image: "" },
      finishesProcessing: false,
      origin: "SYSTEM",
    });
  }
}

/// Chamado pelo debounce worker quando a janela de 10s de uma sessão fecha —
/// re-resolve o contexto (sessão → target → canal → agente) porque o flush
/// acontece de forma assíncrona e desacoplada da requisição HTTP original.
export async function flushDebounceWindow(channel: Channel, messagingSessionId: string): Promise<void> {
  const messages = await popDebounceWindow(messagingSessionId);
  if (messages.length === 0) return;

  const messagingSession = await prisma.messagingSession.findUnique({
    where: { id: messagingSessionId },
    include: { target: { include: { whatsappChannel: { include: { agent: true, serviceIsland: true } } } } },
  });

  if (!messagingSession) {
    console.warn(`Janela de debounce fechou para sessão inexistente: ${messagingSessionId}`);
    return;
  }

  const target = messagingSession.target;
  const whatsappChannel = target.whatsappChannel;

  await markSessionProcessing(messagingSessionId);
  await publishJson(channel, resolveAgentQueueName(whatsappChannel.agent.name), {
    target: { id: target.id, waId: target.waId, name: target.name, metadata: target.metadata },
    whatsappChannel: {
      id: whatsappChannel.id,
      phoneNumberId: whatsappChannel.phoneNumberId,
      wabaId: whatsappChannel.wabaId,
      serviceIslandId: whatsappChannel.serviceIsland?.id ?? null,
    },
    agent: agentPayload(whatsappChannel.agent),
    messagingSession: { id: messagingSession.id, startedAt: messagingSession.startedAt },
    messages,
  });
}
