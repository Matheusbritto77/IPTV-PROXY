import type { Server } from "node:http";
import { createStreamRelayApp } from "./stream-relay-app";
import { sql } from "./config/db";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { redis } from "./config/redis";
import { liveChannelRegistry } from "./services/relay/live-channel-registry";
import { upstreamHealthService } from "./services/proxy/upstream-health-service";

let server: Server | null = null;
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info({ signal }, "stream_relay_shutdown_started");

  upstreamHealthService.stop();

  await new Promise<void>((resolve) => {
    if (!server) {
      resolve();
      return;
    }

    server.close(() => resolve());
  }).catch(() => null);

  liveChannelRegistry.shutdown();

  await redis.quit().catch(() => redis.disconnect());

  const sqlClient = sql as any;
  if (typeof sqlClient.close === "function") {
    await sqlClient.close().catch(() => null);
  } else if (typeof sqlClient.end === "function") {
    await sqlClient.end().catch(() => null);
  }

  logger.info({ signal }, "stream_relay_shutdown_completed");
  process.exit(0);
}

async function bootstrap() {
  await sql`SELECT 1`;
  await redis.connect().catch(() => null);
  upstreamHealthService.start();

  const app = createStreamRelayApp();
  server = app.listen(env.STREAM_RELAY_PORT, "0.0.0.0", () => {
    logger.info({ port: env.STREAM_RELAY_PORT, host: "0.0.0.0" }, "stream_relay_started");
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

bootstrap().catch((error) => {
  logger.error({ error }, "stream_relay_bootstrap_failed");
  process.exit(1);
});
