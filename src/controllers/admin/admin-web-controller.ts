// @ts-nocheck
import type { Request, Response } from "express";
import { env } from "../../config/env";
import { adminUpstreamService } from "../../services/admin/admin-upstream-service";
import { adminUserService } from "../../services/admin/admin-user-service";
import { metricsHistoryService } from "../../services/public/metrics-history-service";
import { requestGuardService } from "../../services/public/request-guard-service";
import { sessionCacheService } from "../../services/public/session-cache-service";
import { upstreamHealthService } from "../../services/proxy/upstream-health-service";
import { renderAdminDashboard } from "../../views/admin-dashboard";

export class AdminWebController {
  async dashboard(_req: Request, res: Response) {
    const defaultEnvUpstream = await adminUpstreamService.ensureDefaultFromEnv();
    const [users, upstreams] = await Promise.all([adminUserService.list(), adminUpstreamService.list()]);
    const [sessionMetrics, guardMetrics, history] = await Promise.all([
      sessionCacheService.getMetrics(),
      requestGuardService.getMetrics(),
      metricsHistoryService.list(),
    ]);
    const upstreamStates = upstreams.map((upstream: any) => ({
      id: upstream.id,
      name: upstream.name,
      smartersUrl: upstream.smartersUrl,
      xciptvDns: upstream.xciptvDns,
      status: upstream.status,
      timeoutMs: upstream.timeoutMs,
      healthy: upstream.status === "ACTIVE",
    }));

    res.type("text/html");
    return res.send(
      renderAdminDashboard({
        appName: env.APP_NAME,
        appBaseUrl: env.APP_BASE_URL,
        adminToken: env.ADMIN_TOKEN,
        defaultUpstreamId: defaultEnvUpstream?.id || upstreamStates[0]?.id || "",
        defaultUpstreamUsername: env.BOOTSTRAP_UPSTREAM_USERNAME || "",
        defaultUpstreamPassword: env.BOOTSTRAP_UPSTREAM_PASSWORD || "",
        users: users.map((user: any) => ({
          id: user.id,
          clientName: user.fullName,
          username: user.username,
          status: user.status,
          expiresAt: new Date(user.expiresAt).toLocaleDateString("pt-BR"),
          maxConnections: user.maxConnections,
        })),
        upstreams: upstreamStates,
        metrics: {
          ...sessionMetrics,
          ...guardMetrics,
        },
        history,
      }),
    );
  }
}

export const adminWebController = new AdminWebController();
