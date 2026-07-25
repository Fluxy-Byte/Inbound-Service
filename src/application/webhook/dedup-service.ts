import { prisma } from "../../infrastructure/database/prisma/client";

/// Checagem rápida e barata, ANTES de resolver o WhatsappChannel — evita gastar
/// uma consulta a mais em uma mensagem que já sabemos ser duplicata.
export async function isMessageAlreadyProcessed(externalMessageId: string): Promise<boolean> {
  const existing = await prisma.processedInboundMessage.findUnique({ where: { externalMessageId } });
  return existing !== null;
}

/// Registra a mensagem como processada — chamado DEPOIS que o WhatsappChannel
/// já foi resolvido, para que `whatsappChannelId` seja sempre o id interno
/// (nunca o phoneNumberId da Meta, que é só um identificador externo). Se a
/// criação falhar por violação de unique constraint (corrida entre duas
/// entregas simultâneas do mesmo webhook), trata como duplicata também.
export async function markMessageProcessed(externalMessageId: string, whatsappChannelId: string): Promise<boolean> {
  try {
    await prisma.processedInboundMessage.create({ data: { externalMessageId, whatsappChannelId } });
    return false;
  } catch {
    return true;
  }
}
