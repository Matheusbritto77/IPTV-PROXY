import { env } from "../../config/env";
import { redis } from "../../config/redis";

type SessionFingerprintInput = {
  userId: string;
  ipAddress: string;
  deviceId?: string;
  streamType?: string;
  streamId?: string;
};

export class SessionCacheService {
  private sessionKey(fingerprint: SessionFingerprintInput) {
    const devicePart = fingerprint.deviceId || fingerprint.ipAddress;
    const streamPart = `${fingerprint.streamType || "api"}:${fingerprint.streamId || "meta"}`;
    return `session:${fingerprint.userId}:${devicePart}:${streamPart}`;
  }

  private userSetKey(userId: string) {
    return `sessions:user:${userId}`;
  }

  async getActiveConnectionCount(userId: string) {
    await this.cleanupUserSet(userId);
    return redis.scard(this.userSetKey(userId));
  }

  async getOrCreateSession(fingerprint: SessionFingerprintInput) {
    const key = this.sessionKey(fingerprint);
    const setKey = this.userSetKey(fingerprint.userId);
    const existing = await redis.get(key);

    if (existing) {
      await redis.expire(key, env.SESSION_TTL_SECONDS);
      await redis.expire(setKey, env.SESSION_TTL_SECONDS);
      return { sessionId: existing, isNew: false };
    }

    const sessionId = crypto.randomUUID();
    const pipeline = redis.multi();
    pipeline.set(key, sessionId, "EX", env.SESSION_TTL_SECONDS);
    pipeline.sadd(setKey, key);
    pipeline.expire(setKey, env.SESSION_TTL_SECONDS);
    await pipeline.exec();

    return { sessionId, isNew: true };
  }

  async closeUserSessions(userId: string) {
    const setKey = this.userSetKey(userId);
    const keys = await redis.smembers(setKey);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.del(setKey);
  }

  async getMetrics() {
    const [sessionKeys, userSets] = await Promise.all([
      redis.keys("session:*"),
      redis.keys("sessions:user:*"),
    ]);

    return {
      activeSessionKeys: sessionKeys.length,
      activeUserSets: userSets.length,
    };
  }

  private async cleanupUserSet(userId: string) {
    const setKey = this.userSetKey(userId);
    const keys = await redis.smembers(setKey);
    if (keys.length === 0) {
      return;
    }

    const pipeline = redis.multi();
    keys.forEach((key) => pipeline.exists(key));
    const existence = await pipeline.exec();
    const staleKeys = keys.filter((_, index) => (existence?.[index]?.[1] as number) === 0);
    if (staleKeys.length > 0) {
      await redis.srem(setKey, ...staleKeys);
    }
  }
}

export const sessionCacheService = new SessionCacheService();
