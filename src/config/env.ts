import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(7081),

  DATABASE_URL: z.string().min(1),

  INTERNAL_API_KEY: z.string().min(1),
  AGENT_API_BASE_URL: z.string().min(1),

  /// Decifra os tokens de terceiro por agente (openaiToken/geminiToken) antes
  /// de repassá-los no payload pro AI-Worker — PRECISA ser idêntica à do
  /// Agent-Api (ver token-cipher.ts nos dois lados).
  AGENT_TOKEN_ENCRYPTION_KEY: z.string().min(1),

  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().min(1),

  RABBITMQ_URL: z.string().min(1),

  MONGO_URL: z.string().min(1),
  MONGO_DB_NAME: z.string().min(1),

  META_VERIFY_TOKEN: z.string().min(1),

  APP_TIMEZONE: z.string().default("America/Sao_Paulo"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
