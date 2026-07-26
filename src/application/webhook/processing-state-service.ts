import { redis } from "../../infrastructure/cache/redis/client";

/// TTL de segurança — se o AI-Worker nunca publicar uma resposta final
/// (crash, mensagem perdida etc.), o flag não fica preso pra sempre
/// bloqueando a próxima processingMessage legítima.
const PROCESSING_TTL_SECONDS = 120;

function processingKey(messagingSessionId: string): string {
  return `processing:session:${messagingSessionId}`;
}

/// Marca que um lote de mensagens acabou de ser entregue ao AI-Worker pra
/// aquela sessão — enquanto esse flag estiver ativo, uma nova mensagem do
/// cliente é tratada como "chegou em cima de um processamento em andamento"
/// (dispara processingMessage). Limpo pelo Outbound-Worker quando a resposta
/// final daquele turno é enviada (mesma chave, ver
/// Outbound-Worker/src/infrastructure/cache/redis/processing-state.ts).
export async function markSessionProcessing(messagingSessionId: string): Promise<void> {
  await redis.set(processingKey(messagingSessionId), "1", "EX", PROCESSING_TTL_SECONDS);
}

export async function isSessionProcessing(messagingSessionId: string): Promise<boolean> {
  return (await redis.exists(processingKey(messagingSessionId))) === 1;
}
