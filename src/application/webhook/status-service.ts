import type { Channel } from "amqplib";
import type { MetaStatus } from "../../domain/meta-webhook";
import { publishJson, QUEUE_NOTIFICATION_STATUS_PROCESS } from "../../infrastructure/queue/rabbitmq/publisher";
import { resolveWhatsappChannel } from "./target-service";

export async function handleStatus(channel: Channel, phoneNumberId: string, status: MetaStatus): Promise<void> {
  const whatsappChannel = await resolveWhatsappChannel(phoneNumberId);
  if (!whatsappChannel) {
    console.warn(`Status recebido para phoneNumberId desconhecido: ${phoneNumberId}`);
    return;
  }

  await publishJson(channel, QUEUE_NOTIFICATION_STATUS_PROCESS, {
    whatsappChannelId: whatsappChannel.id,
    externalMessageId: status.id,
    waStatus: status.status,
    timestamp: status.timestamp,
    recipientUserId: status.recipient_user_id,
  });
}
