import { MongoClient, type Db } from "mongodb";
import { env } from "../../../config/env";

const client = new MongoClient(env.MONGO_URL);
let connected = false;

export async function getMongoDb(): Promise<Db> {
  if (!connected) {
    await client.connect();
    connected = true;
  }
  return client.db(env.MONGO_DB_NAME);
}

export async function pingMongo(): Promise<boolean> {
  try {
    const db = await getMongoDb();
    await db.command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}
