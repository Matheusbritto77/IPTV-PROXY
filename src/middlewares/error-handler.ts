// @ts-nocheck
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../config/logger";
import { HttpError } from "../utils/http-error";

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof HttpError) {
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
