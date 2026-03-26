import { env } from "../../config/env";
import bcrypt from "bcryptjs";
import { sessionRepository } from "../../repositories/session-repository";
import { upstreamRepository } from "../../repositories/upstream-repository";
import { userRepository } from "../../repositories/user-repository";
import { HttpError } from "../../utils/http-error";
import { sessionCacheService } from "../public/session-cache-service";

type CreateUserInput = {
  fullName?: string;
  username: string;
  password: string;
  expiresAt: string;
  maxConnections: number;
  allowedIps?: string[];
  upstreamId: string;
};

type UpdateUserInput = {
  id: string;
  fullName?: string;
  username?: string;
  password?: string;
  expiresAt?: string;
  maxConnections?: number;
  allowedIps?: string[];
  upstreamId?: string;
};

export class AdminUserService {
  async create(input: CreateUserInput) {
    const upstream = await upstreamRepository.findById(input.upstreamId);
    if (!upstream) {
      throw new HttpError(404, "upstream_not_found");
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    return userRepository.create({
      fullName: input.fullName || input.username,
      username: input.username,
      passwordHash,
      expiresAt: new Date(input.expiresAt),
      maxConnections: input.maxConnections,
      allowedIps: input.allowedIps || [],
      upstreamId: input.upstreamId,
      upstreamUsername: env.BOOTSTRAP_UPSTREAM_USERNAME || "",
      upstreamPassword: env.BOOTSTRAP_UPSTREAM_PASSWORD || "",
    });
  }

  list() {
    return userRepository.list();
  }

  async getById(id: string) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new HttpError(404, "user_not_found");
    }

    return user;
  }

  async update(input: UpdateUserInput) {
    if (input.upstreamId) {
      const upstream = await upstreamRepository.findById(input.upstreamId);
      if (!upstream) {
        throw new HttpError(404, "upstream_not_found");
      }
    }

    const passwordHash = input.password ? await bcrypt.hash(input.password, 10) : undefined;
    const user = await userRepository.update(input.id, {
      fullName: input.fullName,
      username: input.username,
      passwordHash,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      maxConnections: input.maxConnections,
      allowedIps: input.allowedIps,
      upstreamId: input.upstreamId,
      upstreamUsername: env.BOOTSTRAP_UPSTREAM_USERNAME,
      upstreamPassword: env.BOOTSTRAP_UPSTREAM_PASSWORD,
    });

    if (!user) {
      throw new HttpError(404, "user_not_found");
    }

    return user;
  }

  async renew(id: string, expiresAt: string) {
    const user = await userRepository.update(id, {
      status: "ACTIVE",
      expiresAt: new Date(expiresAt),
    });

    if (!user) {
      throw new HttpError(404, "user_not_found");
    }

    return user;
  }

  async suspend(id: string) {
    const user = await userRepository.update(id, { status: "SUSPENDED" });
    if (!user) {
      throw new HttpError(404, "user_not_found");
    }

    await sessionRepository.closeActiveByUserId(id);
    await sessionCacheService.closeUserSessions(id);
    return user;
  }

  async activate(id: string) {
    const user = await userRepository.update(id, { status: "ACTIVE" });
    if (!user) {
      throw new HttpError(404, "user_not_found");
    }

    return user;
  }

  async remove(id: string) {
    await sessionRepository.closeActiveByUserId(id);
    await sessionCacheService.closeUserSessions(id);
    const removed = await userRepository.delete(id);
    if (!removed) {
      throw new HttpError(404, "user_not_found");
    }

    return removed;
  }
}

export const adminUserService = new AdminUserService();
