import type { MetaMessageType } from "../../domain/meta-webhook";

export type MessageType = "TEXT" | "AUDIO" | "IMAGE" | "DOCUMENT" | "STICKER";

const MAP: Partial<Record<MetaMessageType, MessageType>> = {
  text: "TEXT",
  audio: "AUDIO",
  image: "IMAGE",
  document: "DOCUMENT",
  sticker: "STICKER",
};

/// Tipos sem correspondência direta (video/location/button/contacts) viram
/// DOCUMENT como aproximação — o AI-Worker trata qualquer tipo != "text" como
/// "formato não suportado" de qualquer forma, então a categoria exata só
/// importa para o histórico exibido no Agent Console.
export function mapMetaMessageType(type: MetaMessageType): MessageType {
  return MAP[type] ?? "DOCUMENT";
}
