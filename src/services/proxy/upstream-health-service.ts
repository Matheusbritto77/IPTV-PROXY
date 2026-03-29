import { logger } from "../../config/logger";
import type { Upstream } from "../../models/domain";
import { upstreamRepository } from "../../repositories/upstream-repository";
import { xtreamUpstreamAdapter } from "../../adapters/upstream/xtream-upstream-adapter";

const HEALTH_CHECK_INTERVAL_MS = 30_000;

export class UpstreamHealthService {
  private cachedUpstreams: Upstream[] = [];
  private lastRefreshAt = 0;
  private refreshInterval: NodeJS.Timeout | null = null;

  start() {
    this.refreshInterval = setInterval(() => {
      void this.refreshAll();
    }, HEALTH_CHECK_INTERVAL_MS);

    void this.refreshAll();
  }

  stop() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  private async refreshAll() {
    try {
      const upstreams = await upstreamRepository.findActive();
      const results = await Promise.allSettled(
        upstreams.map((u) => this.checkOne(u)),
      );

      this.cachedUpstreams = upstreams;
      this.lastRefreshAt = Date.now();

      logger.debug(
        {
          total: upstreams.length,
          healthy: results.filter((r) => r.status === "fulfilled" && r.value).length,
        },
        "upstream_health_refresh_done",
      );
    } catch (error) {
      logger.error({ error }, "upstream_health_refresh_failed");
    }
  }

  private async checkOne(upstream: Upstream): Promise<boolean> {
    try {
      await xtreamUpstreamAdapter.ping(upstream.smartersUrl || upstream.xciptvDns!);
      if (upstream.status !== "ACTIVE") {
        await upstreamRepository.update(upstream.id, { status: "ACTIVE" });
      }
      return true;
    } catch {
      if (upstream.status !== "DEGRADED") {
        await upstreamRepository.update(upstream.id, { status: "DEGRADED" });
      }
      return false;
    }
  }

  pickCandidate(preferred?: Upstream | null): Upstream | null {
    if (preferred && preferred.status !== "DISABLED") {
      return preferred;
    }

    return this.cachedUpstreams.find((u) => u.status === "ACTIVE")
      ?? this.cachedUpstreams[0]
      ?? null;
  }

  async pickCandidateAsync(preferred?: Upstream | null): Promise<Upstream | null> {
    if (this.cachedUpstreams.length === 0 && this.lastRefreshAt === 0) {
      await this.refreshAll();
    }
    return this.pickCandidate(preferred);
  }
}

export const upstreamHealthService = new UpstreamHealthService();
