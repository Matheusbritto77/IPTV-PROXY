import type { Server } from "node:http";
import { createApp } from "./app";
import { sql } from "./config/db";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { redis } from "./config/redis";
import { bootstrapService } from "./services/admin/bootstrap-service";

let server: Server | null = null;
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info({ signal }, "server_shutdown_started");

  await new Promise<void>((resolve) => {
    if (!server) {
      resolve();
      return;
    }

    server.close(() => resolve());
  }).catch(() => null);

  await redis.quit().catch(() => redis.disconnect());

  const sqlClient = sql as any;
  if (typeof sqlClient.close === "function") {
    await sqlClient.close().catch(() => null);
  } else if (typeof sqlClient.end === "function") {
    await sqlClient.end().catch(() => null);
  }

  logger.info({ signal }, "server_shutdown_completed");
  process.exit(0);
}

async function bootstrap() {
  await sql`SELECT 1`;
  await redis.connect().catch(() => null);
  await bootstrapService.run();

  const app = createApp();
  server = app.listen(env.PORT, "0.0.0.0", () => {
    logger.info({ port: env.PORT, host: "0.0.0.0" }, "server_started");
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

bootstrap().catch((error) => {
  logger.error({ error }, "bootstrap_failed");
  process.exit(1);
});
