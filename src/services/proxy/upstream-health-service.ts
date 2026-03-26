import { logger } from "../../config/logger";
import type { Upstream } from "../../models/domain";
import { upstreamRepository } from "../../repositories/upstream-repository";
import { xtreamUpstreamAdapter } from "../../adapters/upstream/xtream-upstream-adapter";

export class UpstreamHealthService {
  async pickCandidate(preferred?: Upstream | null) {
    const upstreams = await upstreamRepository.findActive();
    if (preferred && preferred.status !== "DISABLED") {
      return preferred;
    }

    return upstreams[0] ?? null;
  }

  async markHealthy(id: string) {
    return upstreamRepository.update(id, { status: "ACTIVE" });
  }

  async markDegraded(id: string) {
    return upstreamRepository.update(id, { status: "DEGRADED" });
  }

  async check(upstream: Upstream) {
    try {
      await xtreamUpstreamAdapter.ping(upstream.smartersUrl || upstream.xciptvDns!);
      await this.markHealthy(upstream.id);
      return true;
    } catch (error) {
      logger.warn({ error, upstreamId: upstream.id }, "upstream_health_failed");
      await this.markDegraded(upstream.id);
      return false;
    }
  }
}

export const upstreamHealthService = new UpstreamHealthService();
