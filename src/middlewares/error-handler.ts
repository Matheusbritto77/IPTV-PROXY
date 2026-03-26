// @ts-nocheck
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { HttpError } from "../utils/http-error";

function buildXtreamAuthFailedPayload(error: HttpError) {
  const appUrl = new URL(env.APP_BASE_URL);
  const publicProtocol = env.APP_PUBLIC_PROTOCOL === "auto" ? appUrl.protocol.replace(":", "") : env.APP_PUBLIC_PROTOCOL;
  const isHttps = publicProtocol === "https";
  const port = appUrl.port || (isHttps ? "443" : "80");

  return {
    user_info: {
      auth: 0,
      status: "Disabled",
      message: error.message,
    },
    server_info: {
      url: appUrl.hostname,
      port,
      https_port: isHttps ? port : "443",
      server_protocol: publicProtocol,
      timezone: "America/Sao_Paulo",
      timestamp_now: Math.floor(Date.now() / 1000),
      time_now: new Date().toISOString(),
    },
  };
}

function isXtreamHandshakeRequest(req: Request) {
  return req.path === "/player_api.php" || req.path === "/panel_api.php";
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof HttpError) {
    if (
      isXtreamHandshakeRequest(_req) &&
      ["missing_credentials", "invalid_credentials", "user_suspended", "user_expired", "ip_not_allowed"].includes(
        error.message,
      )
    ) {
      return res.status(200).json(buildXtreamAuthFailedPayload(error));
    }

    return res.status(error.statusCode).json({
      error: error.message,
      details: error.details,
    });
  }

  if (error instanceof ZodError) {
    return res.status(400).json({
      error: "validation_error",
      details: error.flatten(),
    });
  }

  logger.error(
    {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    },
    "unhandled_error",
  );
  return res.status(500).json({ error: "internal_server_error" });
}
