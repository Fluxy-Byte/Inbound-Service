import type { Channel } from "amqplib";
import { publishJson, QUEUE_OUTBOUND_MESSAGE_MARK_READ } from "../../infrastructure/queue/rabbitmq/publisher";

/// Pede pro Outbound-Worker marcar a última mensagem do cliente como lida e
/// ligar o "digitando..." assim que ela entra na fila do agente de IA — quem
/// de fato chama a Graph API é o Outbound-Worker (best-effort, ver
/// outbound-mark-read-consumer.ts), aqui só publicamos o pedido.
export async function requestTypingIndicator(
  channel: Channel,
  whatsappChannelId: string,
  phoneNumberId: string,
  externalMessageId: string,
): Promise<void> {
  await publishJson(channel, QUEUE_OUTBOUND_MESSAGE_MARK_READ, {
    whatsappChannelId,
    phoneNumberId,
    externalMessageId,
    typingIndicator: true,
  });
}
