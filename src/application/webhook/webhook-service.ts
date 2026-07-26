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
  };
}

export async function handleInboundMessage(
  channel: Channel,
  phoneNumberId: string,
  message: MetaMessage,
  contact: MetaContact | undefined,
): Promise<void> {
  console.log(`[inbound] handleInboundMessage id=${message.id} type=${message.type} phoneNumberId=${phoneNumberId}`);

  if (await isMessageAlreadyProcessed(message.id)) {
    console.log(`[inbound] id=${message.id} — mensagem duplicada ignorada (dedup por externalMessageId)`);
    return;
  }

  const whatsappChannel = await resolveWhatsappChannel(phoneNumberId);
  if (!whatsappChannel) {
    console.warn(`[inbound] id=${message.id} — phoneNumberId não cadastrado: ${phoneNumberId}. Mensagem descartada.`);
    return;
  }
  console.log(
    `[inbound] id=${message.id} — canal resolvido whatsappChannelId=${whatsappChannel.id} agent=${whatsappChannel.agent.name}`,
  );

  // whatsappChannelId aqui é sempre o id interno (nunca o phoneNumberId da
  // Meta) — só dá pra saber depois de resolver o canal, por isso o registro
  // definitivo de dedup acontece aqui, não antes.
  if (await markMessageProcessed(message.id, whatsappChannel.id)) {
    console.log(`[inbound] id=${message.id} — mensagem duplicada ignorada (corrida concorrente)`);
    return;
  }

  const target = await resolveOrCreateTarget({
    organizationId: whatsappChannel.organizationId,
    whatsappChannelId: whatsappChannel.id,
    waId: contact?.wa_id ?? message.from,
    name: contact?.profile?.name,
  });
  console.log(`[inbound] id=${message.id} — target resolvido targetId=${target.id} status=${target.status}`);

  const messageType = mapMetaMessageType(message.type);
  const text = message.type === "text" ? (message.text?.body ?? "") : "";

  // Resolve a sessão ANTES de gravar no Mongo — o documento precisa do
  // messagingSessionId final desde a criação, sem update pontual depois.
  const messagingSession = await resolveOrCreateMessagingSession({
    targetId: target.id,
    whatsappChannelId: whatsappChannel.id,
  });
  console.log(`[inbound] id=${message.id} — messagingSession resolvida id=${messagingSession.id}`);

  const mongoMessageId = await saveInboundMessage({
    organizationId: whatsappChannel.organizationId,
    targetId: target.id,
    whatsappChannelId: whatsappChannel.id,
    messagingSessionId: messagingSession.id,
    messageType,
    externalMessageId: message.id,
    text,
  });
  console.log(`[inbound] id=${message.id} — salva no Mongo mongoMessageId=${mongoMessageId}`);

  const targetPayload = { id: target.id, waId: target.waId, name: target.name, metadata: target.metadata };
  const whatsappChannelPayload = {
    id: whatsappChannel.id,
    phoneNumberId: whatsappChannel.phoneNumberId,
    wabaId: whatsappChannel.wabaId,
    serviceIslandId: whatsappChannel.serviceIsland?.id ?? null,
  };
  const messagingSessionPayload = { id: messagingSession.id, startedAt: messagingSession.startedAt };

  if (target.status === "HUMAN") {
    console.log(`[inbound] id=${message.id} — target HUMAN, publicando em ${QUEUE_DESK_MESSAGE_INBOUND}`);
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
    const agentQueue = resolveAgentQueueName(whatsappChannel.agent.name);
    console.log(`[inbound] id=${message.id} — tipo não-texto, publicando direto em ${agentQueue}`);
    await markSessionProcessing(messagingSession.id);
    await publishJson(channel, agentQueue, {
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
  console.log(
    `[inbound] id=${message.id} — empurrada pro debounce window session=${messagingSession.id} isFirstInWindow=${isFirstInWindow}`,
  );

  // processingMessage só faz sentido como aviso de "cheguei em cima de algo
  // que já está rodando" — só dispara se (a) esta mensagem abre uma janela de
  // agrupamento nova E (b) já existe um lote anterior daquela sessão em
  // processamento no AI-Worker. Mensagem de abertura de conversa (ou
  // qualquer turno sem sobreposição) não deve gerar esse aviso.
  const sessionProcessing = await isSessionProcessing(messagingSession.id);
  console.log(`[inbound] id=${message.id} — isSessionProcessing=${sessionProcessing}`);
  if (isFirstInWindow && sessionProcessing) {
    console.log(`[inbound] id=${message.id} — enviando processingMessage (sobreposição detectada)`);
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
  console.log(`[flush] janela expirou session=${messagingSessionId}`);
  const messages = await popDebounceWindow(messagingSessionId);
  console.log(`[flush] session=${messagingSessionId} — popDebounceWindow retornou ${messages.length} mensagem(ns)`);
  if (messages.length === 0) {
    console.warn(`[flush] session=${messagingSessionId} — lista vazia, nada a publicar (nenhuma resposta será enviada)`);
    return;
  }

  const messagingSession = await prisma.messagingSession.findUnique({
    where: { id: messagingSessionId },
    include: { target: { include: { whatsappChannel: { include: { agent: true, serviceIsland: true } } } } },
  });

  if (!messagingSession) {
    console.warn(`[flush] session=${messagingSessionId} — sessão inexistente no banco, mensagens perdidas: ${JSON.stringify(messages)}`);
    return;
  }

  const target = messagingSession.target;
  const whatsappChannel = target.whatsappChannel;
  const agentQueue = resolveAgentQueueName(whatsappChannel.agent.name);

  console.log(
    `[flush] session=${messagingSessionId} — publicando ${messages.length} mensagem(ns) em ${agentQueue}: ${JSON.stringify(messages)}`,
  );

  await markSessionProcessing(messagingSessionId);
  await publishJson(channel, agentQueue, {
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
  console.log(`[flush] session=${messagingSessionId} — publicado em ${agentQueue} com sucesso`);
}
