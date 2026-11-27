import { createClient } from "redis";
import { getRedisConfig } from "./env.js";

let client;
let connectPromise;

function createRedisClient() {
  const config = getRedisConfig();

  const redisClient = createClient({
    RESP: config.respVersion,
    disableOfflineQueue: true,
    socket: {
      host: config.host,
      port: config.port,
      connectTimeout: 2000,
      reconnectStrategy: (retries) => (retries >= 3 ? false : 100 * (retries + 1)),
    },
    ...(config.password ? { password: config.password } : {}),
  });

  redisClient.on("error", () => {
    console.error("[PayTeam Redis] connection error");
  });
  return redisClient;
}

async function getRedisClient() {
  if (!client) client = createRedisClient();

  if (!client.isReady) {
    if (!client.isOpen) {
      if (!connectPromise) {
        const activeClient = client;
        connectPromise = activeClient.connect().finally(() => {
          if (client === activeClient) connectPromise = undefined;
        });
      }
      const activeClient = client;
      try {
        await connectPromise;
      } catch (error) {
        if (client === activeClient) {
          client = undefined;
          connectPromise = undefined;
          activeClient.destroy();
        }
        throw error;
      }
    } else if (connectPromise) {
      await connectPromise;
    }
  }

  if (!client.isReady) throw new Error("Redis is unavailable");
  return client;
}

async function closeRedisConnection() {
  if (!client) return;
  const activeClient = client;
  client = undefined;
  connectPromise = undefined;

  if (activeClient.isReady) {
    await activeClient.close();
  } else {
    activeClient.destroy();
  }
}

const redisConnection = { getRedisClient, closeRedisConnection };

export { getRedisClient, closeRedisConnection };
export default redisConnection;
