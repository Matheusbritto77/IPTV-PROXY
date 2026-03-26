import { sql } from "../config/db";
import type { UserUpdateInput, UserWithUpstream } from "../models/domain";

function toPostgresTextArray(values: string[] | undefined) {
  const input = values || [];
  if (input.length === 0) {
    return "{}";
  }

  const escaped = input.map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return `{${escaped.join(",")}}`;
}

export class UserRepository {
  async findById(id: string): Promise<UserWithUpstream | null> {
    const rows = await sql<UserWithUpstream[]>`
      SELECT
        u.*,
        json_build_object(
          'id', up."id",
          'name', up."name",
          'smartersUrl', up."smartersUrl",
          'xciptvDns', up."xciptvDns",
          'type', up."type",
          'authMode', up."authMode",
          'status', up."status",
          'timeoutMs', up."timeoutMs",
          'metadata', up."metadata",
          'createdAt', up."createdAt",
          'updatedAt', up."updatedAt"
        ) AS upstream
      FROM "User" u
      INNER JOIN "Upstream" up ON up."id" = u."upstreamId"
      WHERE u."id" = ${id}
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  async findByUsername(username: string): Promise<UserWithUpstream | null> {
    const rows = await sql<UserWithUpstream[]>`
      SELECT
        u.*,
        json_build_object(
          'id', up."id",
          'name', up."name",
          'smartersUrl', up."smartersUrl",
          'xciptvDns', up."xciptvDns",
          'type', up."type",
          'authMode', up."authMode",
          'status', up."status",
          'timeoutMs', up."timeoutMs",
          'metadata', up."metadata",
          'createdAt', up."createdAt",
          'updatedAt', up."updatedAt"
        ) AS upstream
      FROM "User" u
      INNER JOIN "Upstream" up ON up."id" = u."upstreamId"
      WHERE u."username" = ${username}
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  async create(data: {
    fullName: string;
    username: string;
    passwordHash: string;
    expiresAt: Date;
    maxConnections: number;
    allowedIps: string[];
    metadata?: unknown;
    upstreamId: string;
    upstreamUsername: string;
    upstreamPassword: string;
  }) {
    const rows = await sql`
      INSERT INTO "User" (
        "id", "fullName", "username", "passwordHash", "expiresAt",
        "metadata",
        "maxConnections", "allowedIps", "upstreamId", "upstreamUsername", "upstreamPassword"
      )
      VALUES (
        ${crypto.randomUUID()}, ${data.fullName}, ${data.username}, ${data.passwordHash}, ${data.expiresAt},
        ${JSON.stringify(data.metadata || {})}::jsonb,
        ${data.maxConnections}, ${toPostgresTextArray(data.allowedIps)}::text[], ${data.upstreamId}, ${data.upstreamUsername}, ${data.upstreamPassword}
      )
      RETURNING *
    `;

    return rows[0];
  }

  async update(id: string, data: UserUpdateInput) {
    const sets: string[] = [];
    const values: unknown[] = [];

    const push = (column: string, value: unknown, options?: { cast?: string }) => {
      values.push(value);
      const cast = options?.cast ? `::${options.cast}` : "";
      sets.push(`"${column}" = $${values.length}${cast}`);
    };

    if (data.fullName !== undefined) push("fullName", data.fullName);
    if (data.username !== undefined) push("username", data.username);
    if (data.passwordHash !== undefined) push("passwordHash", data.passwordHash);
    if (data.status !== undefined) push("status", data.status);
    if (data.expiresAt !== undefined) push("expiresAt", data.expiresAt);
    if (data.maxConnections !== undefined) push("maxConnections", data.maxConnections);
    if (data.allowedIps !== undefined) {
      push("allowedIps", toPostgresTextArray(data.allowedIps), { cast: "text[]" });
    }
    if (data.metadata !== undefined) {
      push("metadata", JSON.stringify(data.metadata), { cast: "jsonb" });
    }
    if (data.upstreamId !== undefined) push("upstreamId", data.upstreamId);
    if (data.upstreamUsername !== undefined) push("upstreamUsername", data.upstreamUsername);
    if (data.upstreamPassword !== undefined) push("upstreamPassword", data.upstreamPassword);

    if (sets.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE "User"
      SET ${sets.join(", ")}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = $${values.length}
      RETURNING "id"
    `;

    const rows = await sql.unsafe<{ id: string }[]>(query, values);
    if (!rows[0]) {
      return null;
    }

    return this.findById(rows[0].id);
  }

  async delete(id: string) {
    const rows = await sql<{ id: string }[]>`
      DELETE FROM "User"
      WHERE "id" = ${id}
      RETURNING "id"
    `;

    return rows[0] ?? null;
  }

  list() {
    return sql<UserWithUpstream[]>`
      SELECT
        u.*,
        json_build_object(
          'id', up."id",
          'name', up."name",
          'smartersUrl', up."smartersUrl",
          'xciptvDns', up."xciptvDns",
          'type', up."type",
          'authMode', up."authMode",
          'status', up."status",
          'timeoutMs', up."timeoutMs",
          'metadata', up."metadata",
          'createdAt', up."createdAt",
          'updatedAt', up."updatedAt"
        ) AS upstream
      FROM "User" u
      INNER JOIN "Upstream" up ON up."id" = u."upstreamId"
      ORDER BY u."createdAt" DESC
    `;
  }
}

export const userRepository = new UserRepository();
