import { normalizeBrazilianWaId } from "../../domain/utils/phone";
import { prisma } from "../../infrastructure/database/prisma/client";

export async function resolveWhatsappChannel(phoneNumberId: string) {
  return prisma.whatsappChannel.findUnique({
    where: { phoneNumberId },
    include: { agent: true, serviceIsland: true },
  });
}

/// bsuid (contacts[].user_id / messages[].from_user_id) é o vínculo
/// principal do contato — presente em todo webhook desde abr/2026,
/// independente de o usuário ter ativado @username. wa_id (telefone) fica
/// opcional: a Meta omite quando o contato ativa @username + privacidade e
/// não há troca de telefone nos últimos 30 dias.
///
/// Resolução em 2 passos: primeiro por bsuid (identidade estável); se não
/// achar E vier um waId, tenta de novo por waId — cobre o Target criado
/// manualmente (sem bsuid ainda) ou criado antes de abr/2026 (quando bsuid
/// não existia), evitando duplicar o contato na primeira mensagem dele
/// depois da migração. Uma vez achado por qualquer um dos dois, o outro
/// campo é preenchido/atualizado (nunca apagado por uma mensagem futura que
/// venha sem aquele dado).
export async function resolveOrCreateTarget(input: {
  organizationId: string;
  whatsappChannelId: string;
  bsuid?: string;
  waId?: string;
  name?: string;
}) {
  const waId = input.waId ? normalizeBrazilianWaId(input.waId) : undefined;
  const bsuid = input.bsuid;

  let existing = bsuid
    ? await prisma.target.findFirst({
        where: { organizationId: input.organizationId, whatsappChannelId: input.whatsappChannelId, bsuid },
      })
    : null;

  if (!existing && waId) {
    existing = await prisma.target.findFirst({
      where: { organizationId: input.organizationId, whatsappChannelId: input.whatsappChannelId, waId },
    });
  }

  if (existing) {
    return prisma.target.update({
      where: { id: existing.id },
      data: {
        lastInteractionAt: new Date(),
        name: input.name ?? existing.name,
        bsuid: bsuid ?? existing.bsuid,
        waId: waId ?? existing.waId,
      },
    });
  }

  return prisma.target.create({
    data: {
      organizationId: input.organizationId,
      whatsappChannelId: input.whatsappChannelId,
      bsuid,
      waId,
      name: input.name,
      lastInteractionAt: new Date(),
    },
  });
}
