// @ts-nocheck
import type { Request, Response } from "express";
import { authService } from "../../services/public/auth-service";
import { HttpError } from "../../utils/http-error";
import { getClientIp, getDeviceId } from "../../utils/request-context";

function getRequiredHeader(req: Request, name: string) {
  const value = req.header(name);
  if (!value) {
    throw new HttpError(400, "missing_edge_header", { header: name });
  }

  return value;
}

export class EdgeController {
  async authorizeStream(req: Request, res: Response) {
    const streamType = getRequiredHeader(req, "x-stream-type") as "live" | "movie" | "series";
    const username = getRequiredHeader(req, "x-proxy-username");
    const password = getRequiredHeader(req, "x-proxy-password");
    const streamId = getRequiredHeader(req, "x-stream-id");
    const extension = getRequiredHeader(req, "x-stream-extension");

    const { user } = await authService.authenticate({
      username,
      password,
      ipAddress: getClientIp(req),
      userAgent: req.header("user-agent"),
      deviceId: getDeviceId(req),
      streamType,
      streamId,
    });

    res.setHeader("X-Edge-User-Id", user.id);
    res.setHeader("X-Edge-Stream-Id", streamId);
    res.setHeader("X-Edge-Stream-Type", streamType);
    res.setHeader("X-Edge-Stream-Extension", extension);
    return res.status(204).end();
  }
}

export const edgeController = new EdgeController();
