import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8080),
  APP_BASE_URL: z.string().url(),
  APP_PUBLIC_PROTOCOL: z.enum(["auto", "http", "https"]).default("auto"),
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
  LIVE_CHANNEL_DRAIN_TTL_MS: z.coerce.number().default(15000),
  LIVE_CHANNEL_RECONNECT_DELAY_MS: z.coerce.number().default(1000),
  LIVE_CHANNEL_RING_BUFFER_CHUNKS: z.coerce.number().default(32),
  LIVE_CHANNEL_RING_BUFFER_BYTES: z.coerce.number().default(262144),
  LIVE_CHANNEL_MAX_SUBSCRIBER_BUFFER_BYTES: z.coerce.number().default(524288),
  STREAM_MODE: z.enum(["redirect", "proxy"]).default("proxy"),
  ADMIN_TOKEN: z.string().min(1),
  EDGE_SHARED_SECRET: z.string().default("change-me-edge-secret"),
  ACCESS_PASSWORD_ENCRYPTION_KEY: z.string().min(16).default("change-me-access-password-key"),
  OPENRESTY_PORT: z.coerce.number().default(8090),
  STREAM_RELAY_PORT: z.coerce.number().default(8081),
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
