// @ts-nocheck
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

export function edgeSharedSecret(req: Request, res: Response, next: NextFunction) {
  if (req.header("x-edge-secret") !== env.EDGE_SHARED_SECRET) {
    return res.status(401).json({ error: "unauthorized_edge" });
  }

  next();
}
