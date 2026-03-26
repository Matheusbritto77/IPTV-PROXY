import type { Server } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { logger } from "../../config/logger";
import { env } from "../../config/env";
import { sessionCacheService } from "../public/session-cache-service";
import { requestGuardService } from "../public/request-guard-service";

export class WebSocketService {
  private io: SocketIOServer | null = null;
  private interval: NodeJS.Timeout | null = null;

  init(server: Server) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: env.APP_BASE_URL || "*",
        methods: ["GET", "POST"],
      },
    });

    this.io.on("connection", (socket) => {
      const token = socket.handshake.auth.token;
      if (token !== env.ADMIN_TOKEN) {
        logger.warn({ id: socket.id }, "websocket_unauthorized_connection");
        socket.disconnect();
        return;
      }

      logger.info({ id: socket.id }, "websocket_client_connected");
    });

    this.startBroadcast();
    return this.io;
  }

  private startBroadcast() {
    if (this.interval) clearInterval(this.interval);

    this.interval = setInterval(async () => {
      try {
        const [sessionMetrics, guardMetrics] = await Promise.all([
          sessionCacheService.getMetrics(),
          requestGuardService.getMetrics(),
        ]);

        const mem = process.memoryUsage();
        const metrics = {
          ...sessionMetrics,
          ...guardMetrics,
          system: {
            memory: Math.round(mem.rss / 1024 / 1024), // MB
            uptime: Math.round(process.uptime()),
          },
          timestamp: new Date().toISOString(),
        };

        this.io?.emit("metrics:update", metrics);
      } catch (error) {
        logger.error({ error }, "websocket_broadcast_failed");
      }
    }, 5000);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.io?.close();
  }
}

export const websocketService = new WebSocketService();
