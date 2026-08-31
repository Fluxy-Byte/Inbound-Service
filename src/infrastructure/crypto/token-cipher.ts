import { createDecipheriv } from "crypto";
import { env } from "../../config/env";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const key = Buffer.from(env.AGENT_TOKEN_ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    throw new Error("AGENT_TOKEN_ENCRYPTION_KEY precisa decodificar (base64) para exatamente 32 bytes (AES-256).");
  }
  return key;
}

/// Espelho do decryptToken do Agent-Api (token-cipher.ts) — formato gravado:
/// "<iv>.<authTag>.<ciphertext>", cada parte em base64. Precisa da MESMA
/// AGENT_TOKEN_ENCRYPTION_KEY dos dois lados, senão a tag de autenticação
/// nunca bate.
export function decryptToken(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Token cifrado em formato inválido.");
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);

  return plaintext.toString("utf8");
}

/// Decifra com fallback null em vez de lançar — usado no ponto de publicação
/// da fila (webhook-service.ts): um token corrompido ou uma chave desatualizada
/// não pode derrubar o processamento da mensagem inteira, só deixa o agente
/// sem aquele token específico (o AI-Worker trata a ausência do seu lado).
export function tryDecryptToken(stored: string | null, label: string): string | null {
  if (!stored) return null;
  try {
    return decryptToken(stored);
  } catch (error) {
    console.error(`Falha ao decifrar ${label}:`, error);
    return null;
  }
}
