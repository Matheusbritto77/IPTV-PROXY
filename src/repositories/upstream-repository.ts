import { sql } from "../config/db";
import type { Upstream, UpstreamUpdateInput } from "../models/domain";

export class UpstreamRepository {
  list() {
    return sql<Upstream[]>`
      SELECT * FROM "Upstream"
      ORDER BY "createdAt" DESC
    `;
  }

  findById(id: string) {
    return sql<Upstream[]>`
      SELECT * FROM "Upstream"
      WHERE "id" = ${id}
      LIMIT 1
    `.then((rows: Upstream[]) => rows[0] ?? null);
  }

  findActive() {
    return sql<Upstream[]>`
      SELECT * FROM "Upstream"
      WHERE "status" <> 'DISABLED'
      ORDER BY
        CASE
          WHEN "status" = 'ACTIVE' THEN 0
          WHEN "status" = 'DEGRADED' THEN 1
          ELSE 2
        END,
        "createdAt" ASC
    `;
  }

  create(data: {
    name: string;
    smartersUrl: string;
    xciptvDns?: string | null;
    type: string;
    authMode: string;
  }) {
    return sql<Upstream[]>`
      INSERT INTO "Upstream" ("id", "name", "smartersUrl", "xciptvDns", "type", "authMode")
      VALUES (${crypto.randomUUID()}, ${data.name}, ${data.smartersUrl}, ${data.xciptvDns ?? null}, ${data.type}, ${data.authMode})
      RETURNING *
    `.then((rows: Upstream[]) => rows[0]);
  }

  async update(id: string, data: UpstreamUpdateInput) {
    const sets: string[] = [];
    const values: unknown[] = [];

    const push = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`"${column}" = $${values.length}`);
    };

    if (data.name !== undefined) push("name", data.name);
    if (data.smartersUrl !== undefined) push("smartersUrl", data.smartersUrl);
    if (data.xciptvDns !== undefined) push("xciptvDns", data.xciptvDns);
    if (data.type !== undefined) push("type", data.type);
    if (data.authMode !== undefined) push("authMode", data.authMode);
    if (data.status !== undefined) push("status", data.status);
    if (data.timeoutMs !== undefined) push("timeoutMs", data.timeoutMs);

    if (sets.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE "Upstream"
      SET ${sets.join(", ")}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = $${values.length}
      RETURNING *
    `;

    const rows = await sql.unsafe<Upstream[]>(query, values);
    return rows[0] ?? null;
  }
}

export const upstreamRepository = new UpstreamRepository();
