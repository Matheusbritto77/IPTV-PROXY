import bcrypt from "bcryptjs";
import { auditEventBus } from "../../events/audit-event-bus";
import { accessPolicy } from "../../policies/access-policy";
import { sessionRepository } from "../../repositories/session-repository";
import { userRepository } from "../../repositories/user-repository";
import { HttpError } from "../../utils/http-error";
import { requestGuardService } from "./request-guard-service";
import { sessionCacheService } from "./session-cache-service";

type AuthenticateInput = {
  username: string;
  password: string;
  ipAddress: string;
  userAgent?: string;
  deviceId?: string;
  streamType?: string;
  streamId?: string;
};

type CachedAuth = {
  user: any;
  expiresAt: number;
};

const AUTH_CACHE_TTL_MS = 15_000;
const authCache = new Map<string, CachedAuth>();

function authCacheKey(username: string, password: string) {
  return `${username}:${password}`;
}

function pruneAuthCache() {
  const now = Date.now();
  for (const [key, entry] of authCache) {
    if (entry.expiresAt <= now) {
      authCache.delete(key);
    }
  }
}

setInterval(pruneAuthCache, 60_000).unref();

export class AuthService {
  async authenticate(input: AuthenticateInput) {
    if (!input.username || !input.password) {
      throw new HttpError(400, "missing_credentials");
    }

    const cacheKey = authCacheKey(input.username, input.password);
    const cached = authCache.get(cacheKey);

    let user: any;

    if (cached && cached.expiresAt > Date.now()) {
      user = cached.user;
    } else {
      user = await userRepository.findByUsername(input.username);
      if (!user) {
        throw new HttpError(401, "invalid_credentials");
      }

      const validPassword = await bcrypt.compare(input.password, user.passwordHash);
      if (!validPassword) {
        await requestGuardService.blockIp(input.ipAddress, 300);
        throw new HttpError(401, "invalid_credentials");
      }

      authCache.set(cacheKey, { user, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
    }

    accessPolicy.assertUserCanAuthenticate(user);
    accessPolicy.assertIpAllowed(user, input.ipAddress);

    const activeConnections = await sessionCacheService.getActiveConnectionCount(user.id);
    accessPolicy.assertConnectionLimit(activeConnections, user.maxConnections);

    const cachedSession = await sessionCacheService.getOrCreateSession({
      userId: user.id,
      ipAddress: input.ipAddress,
      deviceId: input.deviceId,
      streamType: input.streamType,
      streamId: input.streamId,
    });

    let session = { id: cachedSession.sessionId };
    if (cachedSession.isNew) {
      session = await sessionRepository.create({
        userId: user.id,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        deviceId: input.deviceId,
        streamType: input.streamType,
        streamId: input.streamId,
      });
    }

    // fire-and-forget: don't block stream for audit log
    void auditEventBus.publish({
      userId: user.id,
      eventType: "auth.success",
      message: "Authentication succeeded",
      payload: { sessionId: session.id, ipAddress: input.ipAddress },
    });

    void requestGuardService.heartbeat(user.id, input.deviceId);

    return { user, session };
  }

  invalidateCache(username: string) {
    for (const [key] of authCache) {
      if (key.startsWith(`${username}:`)) {
        authCache.delete(key);
      }
    }
  }
}

export const authService = new AuthService();
