import type { Channel } from "amqplib";
import { assertQueueWithDlq } from "./connection";

export const QUEUE_NOTIFICATION_STATUS_PROCESS = "notification.status.process";
export const QUEUE_DESK_MESSAGE_INBOUND = "desk.message.inbound";
export const QUEUE_OUTBOUND_MESSAGE_SEND = "outbound.message.send";

/// Cada agente (axel, atlas, ...) roda como um worker Python separado,
/// consumindo sua PRÓPRIA fila — não existe mais uma fila genérica única de
/// IA. O nome da fila é derivado do nome do Agent cadastrado no Agent-Api,
/// sanitizado (minúsculas, só a-z0-9) pra bater com o AGENT_NAME hardcoded no
/// worker.py de cada pasta (ex.: Agent.name = "Axel" → task.agent.axel.create).
export function resolveAgentQueueName(agentName: string): string {
  const sanitized = agentName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `task.agent.${sanitized}.create`;
}

export async function publishJson(channel: Channel, queue: string, payload: unknown): Promise<void> {
  await assertQueueWithDlq(channel, queue);
  channel.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), { persistent: true });
}
