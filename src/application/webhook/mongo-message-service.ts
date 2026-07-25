import { MESSAGES_COLLECTION, type MessageDocument } from "../../domain/message-document";
import { getMongoDb } from "../../infrastructure/database/mongo/client";
import type { MessageType } from "./message-type-mapper";

export async function saveInboundMessage(input: {
  organizationId: string;
  targetId: string;
  whatsappChannelId: string;
  messagingSessionId: string;
  messageType: MessageType;
  externalMessageId: string;
  text?: string;
}): Promise<string> {
  const db = await getMongoDb();

  const doc: Omit<MessageDocument, "_id"> = {
    organizationId: input.organizationId,
    targetId: input.targetId,
    whatsappChannelId: input.whatsappChannelId,
    messagingSessionId: input.messagingSessionId,
    direction: "INBOUND",
    senderType: "CUSTOMER",
    messageType: input.messageType,
    externalMessageId: input.externalMessageId,
    text: input.text,
    createdAt: new Date(),
  };

  const result = await db.collection<MessageDocument>(MESSAGES_COLLECTION).insertOne(doc);
  return result.insertedId.toString();
}
