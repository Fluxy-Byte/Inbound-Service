/// A Graph API da Meta é inconsistente pra números de celular brasileiros:
/// às vezes manda o wa_id do cliente SEM o "9" (formato antigo, 12 dígitos —
/// 55 + DDD(2) + 8 dígitos do assinante), mesmo quando o número foi salvo
/// COM o 9 em outro fluxo (13 dígitos — 55 + DDD(2) + 9 + 8 dígitos), ou
/// vice-versa. Sem normalizar pra um formato único, o mesmo contato físico
/// vira 2 Target diferentes: um criado pelo disparo ativo (ou cadastro
/// manual), outro quando ele responde pelo WhatsApp — ou o contrário.
/// Espelho de Agent-Api/src/domain/utils/phone.ts — chamar SEMPRE antes de
/// gravar ou buscar um Target por waId.
export function normalizeBrazilianWaId(rawWaId: string): string {
  const digits = rawWaId.replace(/\D/g, "");

  // 12 dígitos = 55 + DDD(2) + 8 dígitos do assinante, sem o 9 do celular —
  // insere o 9 pra convergir com o formato de 13 dígitos usado no resto do
  // sistema. Qualquer outro tamanho (já tem o 9, é de outro país, etc.)
  // passa direto, só limpo de caracteres não numéricos.
  if (digits.length === 12 && digits.startsWith("55")) {
    return `${digits.slice(0, 4)}9${digits.slice(4)}`;
  }

  return digits;
}
