// @ts-nocheck
import type { NextFunction, Request, Response } from "express";
import { requestGuardService } from "../services/public/request-guard-service";
import { getClientIp, getDeviceId } from "../utils/request-context";

export async function requestGuard(req: Request, res: Response, next: NextFunction) {
  const result = await requestGuardService.assertAllowed({
    ipAddress: getClientIp(req),
    deviceId: getDeviceId(req),
  });

  if (!result.allowed) {
    return res.status(429).json({ error: result.reason });
  }

  next();
}
