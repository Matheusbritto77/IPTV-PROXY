import { env } from "../../config/env";
import { upstreamRepository } from "../../repositories/upstream-repository";

type CreateUpstreamInput = {
  name: string;
  smartersUrl: string;
  xciptvDns?: string;
};

type UpdateUpstreamInput = {
  id: string;
  name?: string;
  smartersUrl?: string;
  xciptvDns?: string;
  status?: "ACTIVE" | "DEGRADED" | "DISABLED";
  timeoutMs?: number;
};

export class AdminUpstreamService {
  list() {
    return upstreamRepository.list();
  }

  async ensureDefaultFromEnv() {
    const smartersUrl =
      env.BOOTSTRAP_UPSTREAM_SMARTERS_URL || env.BOOTSTRAP_UPSTREAM_XCIPTV_DNS;
    const xciptvDns =
      env.BOOTSTRAP_UPSTREAM_XCIPTV_DNS || env.BOOTSTRAP_UPSTREAM_SMARTERS_URL;

    if (!smartersUrl) {
      return null;
    }

    const upstreams = await upstreamRepository.list();
    const existing = upstreams.find(
      (item) =>
        item.smartersUrl === smartersUrl ||
        item.xciptvDns === xciptvDns ||
        item.name === (env.BOOTSTRAP_UPSTREAM_NAME || "Default Upstream"),
    );

    if (existing) {
      return existing;
    }

    return upstreamRepository.create({
      name: env.BOOTSTRAP_UPSTREAM_NAME || "Default Upstream",
      smartersUrl,
      xciptvDns,
      type: "XTREAM",
      authMode: "xtream",
    });
  }

  create(input: CreateUpstreamInput) {
    return upstreamRepository.create({
      name: input.name,
      smartersUrl: input.smartersUrl,
      xciptvDns: input.xciptvDns,
      type: "XTREAM",
      authMode: "xtream",
    });
  }

  async update(input: UpdateUpstreamInput) {
    const upstream = await upstreamRepository.update(input.id, input);
    if (!upstream) {
      throw new Error("upstream_not_found");
    }

    return upstream;
  }
}

export const adminUpstreamService = new AdminUpstreamService();
