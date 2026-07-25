import { prisma } from "../../infrastructure/database/prisma/client";

export async function resolveWhatsappChannel(phoneNumberId: string) {
  return prisma.whatsappChannel.findUnique({
    where: { phoneNumberId },
    include: { agent: true, serviceIsland: true },
  });
}

export async function resolveOrCreateTarget(input: {
  organizationId: string;
  whatsappChannelId: string;
  waId: string;
  name?: string;
}) {
  const existing = await prisma.target.findUnique({
    where: {
      organizationId_whatsappChannelId_waId: {
        organizationId: input.organizationId,
        whatsappChannelId: input.whatsappChannelId,
        waId: input.waId,
      },
    },
  });

  if (existing) {
    return prisma.target.update({
      where: { id: existing.id },
      data: { lastInteractionAt: new Date(), name: input.name ?? existing.name },
    });
  }

  return prisma.target.create({
    data: {
      organizationId: input.organizationId,
      whatsappChannelId: input.whatsappChannelId,
      waId: input.waId,
      name: input.name,
      lastInteractionAt: new Date(),
    },
  });
}
