/// Contrato da collection `messages` no Mongo (banco compartilhado). Cópia do
/// contrato canônico em Agent-Api/src/domain/contracts/message-document.ts —
/// mudanças de shape precisam ser espelhadas manualmente em todos os serviços
/// que leem/escrevem essa collection (Agent-Api, Inbound-Service,
/// Outbound-Worker).
export interface MessageDocument {
  _id?: unknown;
  organizationId: string;
  targetId: string;
  whatsappChannelId: string;
  messagingSessionId: string;
  direction: "INBOUND" | "OUTBOUND";
  senderType: "CUSTOMER" | "AGENT_AI" | "ATTENDANT" | "SYSTEM";
  messageType: "TEXT" | "AUDIO" | "IMAGE" | "DOCUMENT" | "STICKER";
  externalMessageId?: string;
  text?: string;
  mediaUrl?: string;
  mediaCaption?: string;
  waStatus?: "sent" | "delivered" | "read" | "failed";
  createdAt: Date;
}

export const MESSAGES_COLLECTION = "messages";
