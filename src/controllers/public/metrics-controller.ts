// @ts-nocheck
import type { Request, Response } from "express";
import { redis } from "../../config/redis";
import { adminUpstreamService } from "../../services/admin/admin-upstream-service";
import { metricsHistoryService } from "../../services/public/metrics-history-service";
import { requestGuardService } from "../../services/public/request-guard-service";
import { sessionCacheService } from "../../services/public/session-cache-service";
import { upstreamHealthService } from "../../services/proxy/upstream-health-service";

export class MetricsController {
  async index(_req: Request, res: Response) {
    const redisStatus = redis.status;
    const [sessionMetrics, guardMetrics, upstreams] = await Promise.all([
      sessionCacheService.getMetrics(),
      requestGuardService.getMetrics(),
      adminUpstreamService.list(),
    ]);

    const upstreamStatuses = await Promise.all(
      upstreams.map(async (upstream: any) => ({
        id: upstream.id,
        name: upstream.name,
        status: upstream.status,
        smartersUrl: upstream.smartersUrl,
        xciptvDns: upstream.xciptvDns,
        healthy: await upstreamHealthService.check(upstream),
      })),
    );

    const payload = {
      status: upstreamStatuses.some((item) => item.healthy) ? "ok" : "degraded",
      redis: {
        status: redisStatus,
        ...sessionMetrics,
        ...guardMetrics,
      },
      upstreams: upstreamStatuses,
      timestamp: new Date().toISOString(),
    };

    await metricsHistoryService.record(payload);
    return res.json({
      ...payload,
      history: await metricsHistoryService.list(),
    });
  }
}

export const metricsController = new MetricsController();
