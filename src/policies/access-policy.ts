import type { User } from "../models/domain";
import { env } from "../config/env";
import { HttpError } from "../utils/http-error";

export class AccessPolicy {
  assertUserCanAuthenticate(user: User) {
    if (user.status === "SUSPENDED") {
      throw new HttpError(403, "user_suspended");
    }

    if (user.status === "EXPIRED" || new Date(user.expiresAt).getTime() < Date.now()) {
      throw new HttpError(403, "user_expired");
    }
  }

  assertIpAllowed(user: User, ipAddress: string) {
    if (!env.IP_ALLOWLIST_ENABLED) {
      return;
    }

    if (user.allowedIps.length > 0 && !user.allowedIps.includes(ipAddress)) {
      throw new HttpError(403, "ip_not_allowed");
    }
  }

  assertConnectionLimit(activeConnections: number, maxConnections: number) {
    if (maxConnections <= 0) {
      return;
    }

    if (activeConnections >= maxConnections) {
      throw new HttpError(429, "connection_limit_reached");
    }
  }
}

export const accessPolicy = new AccessPolicy();
