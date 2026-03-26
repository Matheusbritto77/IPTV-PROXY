import { env } from "../../config/env";
import { redis } from "../../config/redis";

type GuardInput = {
  ipAddress: string;
  deviceId?: string;
};

export class RequestGuardService {
  private isLocalDevelopmentAddress(ipAddress: string) {
    if (env.NODE_ENV !== "development") {
      return false;
    }

    return ipAddress === "::1" || ipAddress === "127.0.0.1" || ipAddress === "::ffff:127.0.0.1";
  }

  async hitRateLimit(key: string) {
    const bucketKey = `rate:${key}`;
    const pipeline = redis.multi();
    pipeline.incr(bucketKey);
    pipeline.expire(bucketKey, env.RATE_LIMIT_WINDOW_SECONDS);
    const result = await pipeline.exec();
    const count = Number(result?.[0]?.[1] ?? 0);

    return {
      count,
      limited: count > env.RATE_LIMIT_MAX_REQUESTS,
    };
  }

  async assertAllowed(input: GuardInput) {
    if (this.isLocalDevelopmentAddress(input.ipAddress)) {
      return { allowed: true };
    }

    const ipLimit = await this.hitRateLimit(`ip:${input.ipAddress}`);
    if (ipLimit.limited) {
      return { allowed: false, reason: "ip_rate_limited" };
    }

    if (input.deviceId) {
      const blocked = await redis.get(`blocked:device:${input.deviceId}`);
      if (blocked) {
        return { allowed: false, reason: "device_blocked" };
      }
    }

    const blockedIp = await redis.get(`blocked:ip:${input.ipAddress}`);
    if (blockedIp) {
      return { allowed: false, reason: "ip_blocked" };
    }

    return { allowed: true };
  }

  blockIp(ipAddress: string, ttlSeconds = 3600) {
    if (this.isLocalDevelopmentAddress(ipAddress)) {
      return Promise.resolve("OK");
    }

    return redis.set(`blocked:ip:${ipAddress}`, "1", "EX", ttlSeconds);
  }

  blockDevice(deviceId: string, ttlSeconds = 3600) {
    return redis.set(`blocked:device:${deviceId}`, "1", "EX", ttlSeconds);
  }

  heartbeat(userId: string, deviceId?: string) {
    const key = `heartbeat:${userId}:${deviceId || "default"}`;
    return redis.set(key, new Date().toISOString(), "EX", env.SESSION_TTL_SECONDS);
  }

  async getMetrics() {
    const [rateKeys, blockedIps, blockedDevices, heartbeats] = await Promise.all([
      redis.keys("rate:*"),
      redis.keys("blocked:ip:*"),
      redis.keys("blocked:device:*"),
      redis.keys("heartbeat:*"),
    ]);

    return {
      rateBuckets: rateKeys.length,
      blockedIps: blockedIps.length,
      blockedDevices: blockedDevices.length,
      heartbeats: heartbeats.length,
    };
  }
}

export const requestGuardService = new RequestGuardService();
