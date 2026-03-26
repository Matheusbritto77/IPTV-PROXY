import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { upstreamRepository } from "../../repositories/upstream-repository";
import { userRepository } from "../../repositories/user-repository";
import { bootstrapCardService } from "./bootstrap-card-service";
import { adminUpstreamService } from "./admin-upstream-service";
import { adminUserService } from "./admin-user-service";

function ensureBootstrapConfig() {
  return (
    env.BOOTSTRAP_ENABLED &&
    env.BOOTSTRAP_CLIENT_NAME &&
    env.BOOTSTRAP_USERNAME &&
    env.BOOTSTRAP_PASSWORD &&
    env.BOOTSTRAP_EXPIRES_AT &&
    env.BOOTSTRAP_UPSTREAM_NAME &&
    (env.BOOTSTRAP_UPSTREAM_SMARTERS_URL || env.BOOTSTRAP_UPSTREAM_XCIPTV_DNS) &&
    env.BOOTSTRAP_UPSTREAM_USERNAME &&
    env.BOOTSTRAP_UPSTREAM_PASSWORD
  );
}

export class BootstrapService {
  async run() {
    if (!ensureBootstrapConfig()) {
      logger.info("bootstrap_skipped");
      return;
    }

    let upstream = (await upstreamRepository.list()).find(
      (item) =>
        item.smartersUrl === env.BOOTSTRAP_UPSTREAM_SMARTERS_URL ||
        item.xciptvDns === env.BOOTSTRAP_UPSTREAM_XCIPTV_DNS,
    );

    if (!upstream) {
      const createdUpstream = await adminUpstreamService.create({
        name: env.BOOTSTRAP_UPSTREAM_NAME!,
        smartersUrl: env.BOOTSTRAP_UPSTREAM_SMARTERS_URL || env.BOOTSTRAP_UPSTREAM_XCIPTV_DNS!,
        xciptvDns: env.BOOTSTRAP_UPSTREAM_XCIPTV_DNS || env.BOOTSTRAP_UPSTREAM_SMARTERS_URL,
      });

      if (!createdUpstream) {
        throw new Error("bootstrap_upstream_create_failed");
      }

      upstream = createdUpstream;
      logger.info({ upstreamId: createdUpstream.id }, "bootstrap_upstream_created");
    }

    if (!upstream) {
      throw new Error("bootstrap_upstream_unavailable");
    }

    const existingUser = await userRepository.findByUsername(env.BOOTSTRAP_USERNAME!);
    if (!existingUser) {
      const user = await adminUserService.create({
        fullName: env.BOOTSTRAP_CLIENT_NAME!,
        username: env.BOOTSTRAP_USERNAME!,
        password: env.BOOTSTRAP_PASSWORD!,
        expiresAt: env.BOOTSTRAP_EXPIRES_AT!,
        maxConnections: env.BOOTSTRAP_MAX_CONNECTIONS ?? 0,
        upstreamId: upstream.id,
      });
      logger.info({ userId: user.id, username: user.username }, "bootstrap_user_created");
      await bootstrapCardService.write({
        clientName: env.BOOTSTRAP_CLIENT_NAME!,
        username: env.BOOTSTRAP_USERNAME!,
        password: env.BOOTSTRAP_PASSWORD!,
        expiresAtIso: env.BOOTSTRAP_EXPIRES_AT!,
      });
      return;
    }

    await bootstrapCardService.write({
      clientName: env.BOOTSTRAP_CLIENT_NAME!,
      username: env.BOOTSTRAP_USERNAME!,
      password: env.BOOTSTRAP_PASSWORD!,
      expiresAtIso: env.BOOTSTRAP_EXPIRES_AT!,
    });
    logger.info({ username: existingUser.username }, "bootstrap_user_already_exists");
  }
}

export const bootstrapService = new BootstrapService();
