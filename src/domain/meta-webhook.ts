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
  /// Telefone — a Meta omite quando o contato ativou @username e não há
  /// troca recente de telefone (ver MetaMessage.from_user_id).
  wa_id?: string;
  /// Business-Scoped User ID — presente em todo webhook desde abr/2026,
  /// independente de @username. Vínculo principal do contato (ver
  /// application/webhook/target-service.ts#resolveOrCreateTarget).
  user_id?: string;
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
  /// Telefone do remetente — opcional pelo mesmo motivo de MetaContact.wa_id.
  from?: string;
  /// BSUID do remetente — espelha MetaContact.user_id, presente direto no
  /// próprio objeto de mensagem.
  from_user_id?: string;
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
