import { sql } from "../config/db";

export class SessionRepository {
  async countActiveByUserId(userId: string) {
    const rows = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count
      FROM "StreamSession"
      WHERE "userId" = ${userId}
      AND "status" = 'ACTIVE'
    `;

    return Number(rows[0]?.count ?? 0);
  }

  create(input: {
    userId: string;
    ipAddress: string;
    userAgent?: string;
    deviceId?: string;
    streamType?: string;
    streamId?: string;
  }) {
    return sql`
      INSERT INTO "StreamSession" (
        "id", "userId", "ipAddress", "userAgent", "deviceId", "streamType", "streamId"
      )
      VALUES (
        ${crypto.randomUUID()}, ${input.userId}, ${input.ipAddress}, ${input.userAgent ?? null},
        ${input.deviceId ?? null}, ${input.streamType ?? null}, ${input.streamId ?? null}
      )
      RETURNING *
    `.then((rows: any[]) => rows[0]);
  }

  async closeActiveByUserId(userId: string) {
    await sql`
      UPDATE "StreamSession"
      SET "status" = 'CLOSED', "endedAt" = CURRENT_TIMESTAMP, "lastSeenAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId}
      AND "status" = 'ACTIVE'
    `;
  }
}

export const sessionRepository = new SessionRepository();
