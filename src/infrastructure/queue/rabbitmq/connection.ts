import amqplib, { type ChannelModel, type Channel } from "amqplib";
import { env } from "../../../config/env";

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

export async function getRabbitChannel(): Promise<Channel> {
  if (channel) return channel;

  connection = await amqplib.connect(env.RABBITMQ_URL);
  channel = await connection.createChannel();

  connection.on("close", () => {
    connection = null;
    channel = null;
  });

  return channel;
}

export async function assertQueueWithDlq(channel: Channel, queueName: string): Promise<void> {
  const dlq = `${queueName}.dlq`;

  await channel.assertQueue(dlq, { durable: true });
  await channel.assertQueue(queueName, {
    durable: true,
    deadLetterExchange: "",
    deadLetterRoutingKey: dlq,
  });
}
