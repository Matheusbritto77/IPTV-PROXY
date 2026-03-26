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

export class AuthService {
  async authenticate(input: AuthenticateInput) {
    if (!input.username || !input.password) {
      throw new HttpError(400, "missing_credentials");
    }

    const user = await userRepository.findByUsername(input.username);
    if (!user) {
      throw new HttpError(401, "invalid_credentials");
    }

    const validPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!validPassword) {
      await requestGuardService.blockIp(input.ipAddress, 300);
      throw new HttpError(401, "invalid_credentials");
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

    await auditEventBus.publish({
      userId: user.id,
      eventType: "auth.success",
      message: "Authentication succeeded",
      payload: { sessionId: session.id, ipAddress: input.ipAddress },
    });

    await requestGuardService.heartbeat(user.id, input.deviceId);

    return { user, session };
  }
}

export const authService = new AuthService();
