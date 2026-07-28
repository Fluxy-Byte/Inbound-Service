import type { Channel } from "amqplib";
import { assertQueueWithDlq } from "./connection";

export const QUEUE_NOTIFICATION_STATUS_PROCESS = "notification.status.process";
export const QUEUE_DESK_MESSAGE_INBOUND = "desk.message.inbound";
export const QUEUE_OUTBOUND_MESSAGE_SEND = "outbound.message.send";
export const QUEUE_OUTBOUND_MESSAGE_MARK_READ = "outbound.message.mark-read";

/// Todo agente tem fila própria, nome derivado de Agent.name sanitizado
/// (ex: Agent.name = "Suporte Financeiro" → task.agent.suportefinanceiro.create).
/// atlas e axel têm persona fixa em código Python, cada um seu worker
/// dedicado; qualquer OUTRO agente — criado livremente pela tela — roda no
/// worker genérico "max" (AI-Worker/max), que monta a personalidade/RAG em
/// runtime a partir do payload de cada mensagem, mas ainda assim uma
/// instância dedicada por agente (env AGENT_NAME seleciona qual fila essa
/// instância consome). Criar um agente novo pela UI só funciona depois que
/// uma instância do worker for implantada apontando pra fila dele — não é
/// mais zero-deploy (trade-off aceito em troca de isolamento por agente).
export function resolveAgentQueueName(agentName: string): string {
  const sanitized = agentName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `task.agent.${sanitized}.create`;
}

export async function publishJson(channel: Channel, queue: string, payload: unknown): Promise<void> {
  await assertQueueWithDlq(channel, queue);
  channel.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), { persistent: true });
}
