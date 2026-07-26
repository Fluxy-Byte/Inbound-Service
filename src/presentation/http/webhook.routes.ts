import type { Channel } from "amqplib";
import { Router } from "express";
import { env } from "../../config/env";
import type { MetaWebhookBody } from "../../domain/meta-webhook";
import { handleStatus } from "../../application/webhook/status-service";
import { handleInboundMessage } from "../../application/webhook/webhook-service";

export function buildWebhookRouter(channel: Channel): Router {
  const router = Router();

  router.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === env.META_VERIFY_TOKEN) {
      res.status(200).send(challenge);
      return;
    }

    res.sendStatus(403);
  });

  router.post("/webhook", async (req, res) => {
    try {
      const body = req.body as MetaWebhookBody;
      const value = body?.entry?.[0]?.changes?.[0]?.value;

      if (value?.statuses) {
        for (const status of value.statuses) {
          await handleStatus(channel, value.metadata.phone_number_id, status);
        }
      } else if (value?.messages) {
        for (const message of value.messages) {
          await handleInboundMessage(channel, value.metadata.phone_number_id, message, value.contacts?.[0]);
        }
      }

      res.sendStatus(200);
    } catch (error) {
      console.error("Erro ao processar webhook da Meta:", error);
      // Sempre 200 — evita retries agressivos da Meta por um erro que já foi
      // logado; a mensagem, se não foi deduplicada com sucesso, será
      // reprocessada na próxima entrega (Meta reenvia se não receber 200).
      res.sendStatus(200);
    }
  });

  return router;
}
