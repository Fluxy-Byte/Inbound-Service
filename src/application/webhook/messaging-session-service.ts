import { prisma } from "../../infrastructure/database/prisma/client";

const WINDOW_MS = 24 * 60 * 60 * 1000;

/// A expiração da janela de 24h é sempre CALCULADA a partir de
/// lastCustomerMessageAt — nunca armazenada como flag. Uma sessão expirada (ou
/// inexistente) nunca é mutada: uma nova linha é criada, preservando a antiga
/// para histórico/auditoria (mesmo Target+WhatsappChannel).
export async function resolveOrCreateMessagingSession(input: { targetId: string; whatsappChannelId: string }) {
  const latest = await prisma.messagingSession.findFirst({
    where: { targetId: input.targetId },
    orderBy: { startedAt: "desc" },
  });

  const expired = !latest || Date.now() - latest.lastCustomerMessageAt.getTime() > WINDOW_MS;

  if (expired) {
    return prisma.messagingSession.create({
      data: {
        targetId: input.targetId,
        whatsappChannelId: input.whatsappChannelId,
        createdVia: "CUSTOMER_MESSAGE",
        lastCustomerMessageAt: new Date(),
      },
    });
  }

  return prisma.messagingSession.update({
    where: { id: latest.id },
    data: { lastCustomerMessageAt: new Date() },
  });
}
