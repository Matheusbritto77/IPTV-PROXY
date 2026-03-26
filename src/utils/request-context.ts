// @ts-nocheck
import type { Request } from "express";

export function getClientIp(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0]?.trim() || req.ip || "0.0.0.0";
  }

  return req.ip || req.socket.remoteAddress || "0.0.0.0";
}

export function getDeviceId(req: Request) {
  return (
    req.header("x-device-id") ||
    req.header("x-mac-address") ||
    req.query.device_id?.toString() ||
    undefined
  );
}
