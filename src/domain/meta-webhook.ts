/// Formato do payload de webhook da Meta (WhatsApp Cloud API). Referência:
/// E:\Fluxy Gestão\.DEPRECADO\Orquestrador-meta (git history,
/// src/presentation/interfaces/meta.interface.ts).
export interface MetaWebhookBody {
  object: string;
  entry: MetaEntry[];
}

export interface MetaEntry {
  id: string;
  changes: MetaChange[];
}

export interface MetaChange {
  field: string;
  value: MetaChangeValue;
}

export interface MetaChangeValue {
  messaging_product: "whatsapp";
  metadata: { display_phone_number: string; phone_number_id: string };
  contacts?: MetaContact[];
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
}

export interface MetaContact {
  profile: { name?: string };
  wa_id?: string;
}

export type MetaMessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "button"
  | "contacts";

export interface MetaMessage {
  from: string;
  id: string;
  timestamp: string;
  type: MetaMessageType;
  text?: { body?: string };
}

export interface MetaStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
}
