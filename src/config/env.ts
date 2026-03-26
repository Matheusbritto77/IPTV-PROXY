import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8080),
  APP_BASE_URL: z.string().url(),
  APP_PUBLIC_PROTOCOL: z.enum(["auto", "http", "https"]).default("auto"),
  PREFERRED_LIVE_FORMAT: z.enum(["auto", "m3u8", "ts"]).default("auto"),
  PREFERRED_VOD_FORMAT: z.enum(["auto", "m3u8", "mp4"]).default("auto"),
  APP_NAME: z.string().default("P2P Gateway"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_TTL_SECONDS: z.coerce.number().default(300),
  REQUEST_GUARD_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  IP_ALLOWLIST_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(30),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(120),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().default(8000),
  UPSTREAM_MAX_IDLE_CONNECTIONS: z.coerce.number().default(256),
  UPSTREAM_MAX_CONNECTIONS_PER_HOST: z.coerce.number().default(128),
  UPSTREAM_IDLE_TIMEOUT_MS: z.coerce.number().default(90000),
  UPSTREAM_TLS_HANDSHAKE_TIMEOUT_MS: z.coerce.number().default(5000),
  STREAM_MODE: z.enum(["redirect", "proxy"]).default("proxy"),
  ADMIN_TOKEN: z.string().min(1),
  EDGE_SHARED_SECRET: z.string().default("change-me-edge-secret"),
  ACCESS_PASSWORD_ENCRYPTION_KEY: z.string().min(16).default("change-me-access-password-key"),
  OPENRESTY_PORT: z.coerce.number().default(8090),
  STREAM_RELAY_PORT: z.coerce.number().default(8081),
  STREAM_RELAY_REQUEST_TIMEOUT_MS: z.coerce.number().default(12000),
  STREAM_RELAY_MAX_IDLE_CONNS: z.coerce.number().default(512),
  STREAM_RELAY_MAX_IDLE_CONNS_PER_HOST: z.coerce.number().default(256),
  STREAM_RELAY_MAX_CONNS_PER_HOST: z.coerce.number().default(256),
  STREAM_RELAY_IDLE_CONN_TIMEOUT_MS: z.coerce.number().default(90000),
  STREAM_RELAY_RESPONSE_HEADER_TIMEOUT_MS: z.coerce.number().default(10000),
  STREAM_RELAY_TLS_HANDSHAKE_TIMEOUT_MS: z.coerce.number().default(5000),
  APP_UPSTREAM_ORIGIN: z.string().url().default("http://127.0.0.1:8080"),
  STREAM_RELAY_ORIGIN: z.string().url().default("http://127.0.0.1:8081"),
  BOOTSTRAP_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  BOOTSTRAP_CLIENT_NAME: z.string().optional(),
  BOOTSTRAP_USERNAME: z.string().optional(),
  BOOTSTRAP_PASSWORD: z.string().optional(),
  BOOTSTRAP_EXPIRES_AT: z.string().optional(),
  BOOTSTRAP_MAX_CONNECTIONS: z.coerce.number().optional(),
  BOOTSTRAP_UPSTREAM_NAME: z.string().optional(),
  BOOTSTRAP_UPSTREAM_SMARTERS_URL: z.string().optional(),
  BOOTSTRAP_UPSTREAM_XCIPTV_DNS: z.string().optional(),
  BOOTSTRAP_UPSTREAM_USERNAME: z.string().optional(),
  BOOTSTRAP_UPSTREAM_PASSWORD: z.string().optional(),
});

export const env = envSchema.parse(process.env);
