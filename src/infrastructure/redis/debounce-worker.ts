import Redis from "ioredis";
import { env } from "../../config/env";
import { extractSessionIdFromMarkerKey } from "../../application/webhook/debounce-service";

/// Processo em segundo plano (não a request HTTP) que detecta o fechamento da
/// janela de debounce via keyspace notifications do Redis (evento "expired"
/// da chave marcadora `debounce:session:<id>`) e dispara o flush pro AI-Worker.
/// Testado contra o Dragonfly gerenciado em nuvem — `CONFIG SET
/// notify-keyspace-events Ex` funciona normalmente lá (confirmado
/// manualmente antes de escrever isto), então não é necessário o fallback de
/// polling.
export function startDebounceWorker(onWindowClosed: (messagingSessionId: string) => Promise<void>): void {
  const admin = new Redis({ host: env.REDIS_HOST, port: env.REDIS_PORT, password: env.REDIS_PASSWORD });
  const subscriber = new Redis({ host: env.REDIS_HOST, port: env.REDIS_PORT, password: env.REDIS_PASSWORD });

  admin
    .config("SET", "notify-keyspace-events", "Ex")
    .then(() => console.log("Debounce worker: keyspace notifications habilitadas (Ex)."))
    .catch((error) => console.error("Falha ao habilitar keyspace notifications:", error));

  subscriber.psubscribe("__keyevent@*__:expired", (error) => {
    if (error) console.error("Falha ao assinar eventos de expiração do Redis:", error);
  });

  subscriber.on("pmessage", async (_pattern, _channel, expiredKey: string) => {
    const messagingSessionId = extractSessionIdFromMarkerKey(expiredKey);
    console.log(`[debounce-worker] chave expirada: ${expiredKey} — sessionId extraído: ${messagingSessionId}`);
    if (!messagingSessionId) return;

    try {
      await onWindowClosed(messagingSessionId);
    } catch (error) {
      console.error(`Falha ao processar fechamento da janela de debounce (sessão ${messagingSessionId}):`, error);
    }
  });

  console.log("Debounce worker: aguardando janelas de agrupamento expirarem.");
}
