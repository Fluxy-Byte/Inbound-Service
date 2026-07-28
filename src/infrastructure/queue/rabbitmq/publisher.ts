import type { Channel } from "amqplib";
import { assertQueueWithDlq } from "./connection";

export const QUEUE_NOTIFICATION_STATUS_PROCESS = "notification.status.process";
export const QUEUE_DESK_MESSAGE_INBOUND = "desk.message.inbound";
export const QUEUE_OUTBOUND_MESSAGE_SEND = "outbound.message.send";

/// atlas e axel têm persona fixa em código Python — cada um roda como worker
/// separado, consumindo sua PRÓPRIA fila (nome derivado do Agent.name,
/// sanitizado, pra bater com o AGENT_NAME hardcoded no worker.py de cada
/// pasta: Agent.name = "Axel" → task.agent.axel.create).
///
/// Qualquer OUTRO agente — criado livremente pela tela, com o nome que for —
/// não tem worker dedicado: cai todo numa fila genérica única
/// (task.agent.generic.create), consumida pelo worker "max" (AI-Worker/max),
/// que monta a personalidade/RAG em runtime a partir do payload de cada
/// mensagem (nunca fixa nada por agente). Isso é o que permite criar um
/// agente novo pela UI e ele já funcionar na hora, sem deploy de código novo.
const RESERVED_ENGINE_AGENT_NAMES = new Set(["atlas", "axel"]);
const GENERIC_AGENT_QUEUE = "task.agent.generic.create";

export function resolveAgentQueueName(agentName: string): string {
  const sanitized = agentName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (RESERVED_ENGINE_AGENT_NAMES.has(sanitized)) return `task.agent.${sanitized}.create`;
  return GENERIC_AGENT_QUEUE;
}

export async function publishJson(channel: Channel, queue: string, payload: unknown): Promise<void> {
  await assertQueueWithDlq(channel, queue);
  channel.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), { persistent: true });
}
