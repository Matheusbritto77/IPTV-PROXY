import { logger } from "../config/logger";
import { sql } from "../config/db";

type AuditEventInput = {
  userId?: string;
  eventType: string;
  message: string;
  payload?: unknown;
};

export class AuditEventBus {
  async publish(event: AuditEventInput) {
    try {
      await sql`
        INSERT INTO "AuditLog" ("id", "userId", "eventType", "message", "payload")
        VALUES (${crypto.randomUUID()}, ${event.userId ?? null}, ${event.eventType}, ${event.message}, ${JSON.stringify(event.payload ?? null)}::jsonb)
      `;
    } catch (error) {
      logger.error({ error, event }, "audit_persist_failed");
    }
  }
}

export const auditEventBus = new AuditEventBus();
