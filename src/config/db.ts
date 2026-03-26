// @ts-nocheck
import { env } from "./env";

export const sql = new Bun.SQL(env.DATABASE_URL);
