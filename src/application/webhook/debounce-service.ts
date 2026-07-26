import { redis } from "../../infrastructure/cache/redis/client";

const WINDOW_SECONDS = 10;

function markerKey(messagingSessionId: string): string {
  return `debounce:session:${messagingSessionId}`;
}

function queueKey(messagingSessionId: string): string {
  return `debounce:session:${messagingSessionId}:queue`;
}

export interface DebouncedMessage {
  mongoMessageId: string;
  externalMessageId: string;
  type: "TEXT";
  text: string;
  timestamp: string;
}

/// Agrupamento por sessão com janela de 10s que reinicia a cada mensagem nova
/// (regra exata do EscopoSaas). RPUSH acumula em ordem de chegada; o SET com
/// GET diz se essa é a PRIMEIRA mensagem da janela (pra decidir se manda a
/// processingMessage imediata) e sempre reseta o TTL, seja janela nova ou não.
export async function pushToDebounceWindow(
  messagingSessionId: string,
  message: DebouncedMessage,
): Promise<{ isFirstInWindow: boolean }> {
  const length = await redis.rpush(queueKey(messagingSessionId), JSON.stringify(message));
  const previous = await redis.set(markerKey(messagingSessionId), "1", "EX", WINDOW_SECONDS, "GET");
  const isFirstInWindow = previous === null;
  console.log(
    `[debounce] push session=${messagingSessionId} externalMessageId=${message.externalMessageId} ` +
      `queueLength=${length} isFirstInWindow=${isFirstInWindow}`,
  );
  return { isFirstInWindow };
}

export async function popDebounceWindow(messagingSessionId: string): Promise<DebouncedMessage[]> {
  const key = queueKey(messagingSessionId);
  const raw = await redis.lrange(key, 0, -1);
  await redis.del(key);
  console.log(`[debounce] pop session=${messagingSessionId} — ${raw.length} item(ns) na fila: ${raw.join(" | ")}`);
  return raw.map((item) => JSON.parse(item) as DebouncedMessage);
}

export function extractSessionIdFromMarkerKey(key: string): string | null {
  const match = key.match(/^debounce:session:(.+)$/);
  if (!match) return null;
  // A chave da lista (":queue") também bate nesse regex — ela nunca expira
  // (sem TTL), então só a marcadora dispara o evento "expired", mas o regex
  // sozinho não distingue; o filtro real é feito no listener (ver
  // redis-debounce-worker.ts), que só reage a eventos "expired" de verdade.
  return match[1];
}
