import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { flushDebounceWindow } from "./application/webhook/webhook-service";
import { pingMongo } from "./infrastructure/database/mongo/client";
import { prisma } from "./infrastructure/database/prisma/client";
import { redis } from "./infrastructure/cache/redis/client";
import { getRabbitChannel } from "./infrastructure/queue/rabbitmq/connection";
import { startDebounceWorker } from "./infrastructure/redis/debounce-worker";
import { buildWebhookRouter } from "./presentation/http/webhook.routes";

async function main() {
  await prisma.$connect();
  const channel = await getRabbitChannel();

  startDebounceWorker(async (messagingSessionId) => {
    await flushDebounceWindow(channel, messagingSessionId);
  });

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use(buildWebhookRouter(channel));

  app.get("/health", async (_req, res) => {
    const [dbOk, redisOk, mongoOk] = await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      redis.ping().then(() => true).catch(() => false),
      pingMongo(),
    ]);

    res.json({ status: "ok", service: "inbound-service", db: dbOk, redis: redisOk, mongo: mongoOk });
  });

  app.listen(env.PORT, () => {
    console.log(`Inbound-Service listening on port ${env.PORT}`);
  });
}

main().catch((error) => {
  console.error("Fatal error during Inbound-Service bootstrap:", error);
  process.exit(1);
});
