// @ts-nocheck
import type { Request, Response } from "express";
import { metricsController } from "./metrics-controller";

export class HealthController {
  index(_req: Request, res: Response) {
    return res.json({
      status: "ok",
      service: "p2p-gateway",
      timestamp: new Date().toISOString(),
    });
  }

  async detailed(req: Request, res: Response) {
    return metricsController.index(req, res);
  }
}

export const healthController = new HealthController();
