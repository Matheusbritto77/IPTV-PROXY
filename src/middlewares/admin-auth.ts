// @ts-nocheck
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

function getCookieToken(req: Request) {
  const cookieHeader = req.header("cookie");
  if (!cookieHeader) {
    return undefined;
  }

  const cookies = cookieHeader.split(";").map((part) => part.trim());
  const tokenCookie = cookies.find((part) => part.startsWith("admin_token="));
  return tokenCookie?.slice("admin_token=".length);
}

export function adminAuth(req: Request, res: Response, next: NextFunction) {
  const token =
    req.header("x-admin-token") ||
    req.query.token?.toString() ||
    getCookieToken(req);

  if (!token || token !== env.ADMIN_TOKEN) {
    return res.status(401).json({ error: "unauthorized_admin" });
  }

  if (req.query.token?.toString() === env.ADMIN_TOKEN) {
    res.setHeader(
      "Set-Cookie",
      `admin_token=${env.ADMIN_TOKEN}; Path=/admin; HttpOnly; SameSite=Lax`,
    );
  }

  next();
}
