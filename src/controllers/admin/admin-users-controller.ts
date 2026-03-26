// @ts-nocheck
import type { Request, Response } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { adminUpstreamService } from "../../services/admin/admin-upstream-service";
import { adminUserService } from "../../services/admin/admin-user-service";
import { renderClientCard } from "../../views/client-template";

const createUserSchema = z.object({
  fullName: z.string().nullable().optional(),
  username: z.string().min(3),
  password: z.string().min(6),
  expiresAt: z.string().datetime(),
  maxConnections: z.number().int().min(0).default(0),
  allowedIps: z.array(z.string()).optional(),
  upstreamId: z.string().min(1).optional(),
});

const updateUserSchema = z.object({
  fullName: z.string().nullable().optional(),
  username: z.string().min(3).optional(),
  password: z.string().min(6).optional(),
  expiresAt: z.string().datetime().optional(),
  maxConnections: z.number().int().min(0).optional(),
  allowedIps: z.array(z.string()).optional(),
  upstreamId: z.string().min(1).optional(),
});

const renewUserSchema = z.object({
  expiresAt: z.string().datetime(),
});

export class AdminUsersController {
  async index(_req: Request, res: Response) {
    const users = await adminUserService.list();
    return res.json(
      users.map((user: {
        id: string;
        fullName: string;
        username: string;
        expiresAt: Date;
        status: string;
        maxConnections: number;
      }) => ({
        id: user.id,
        clientName: user.fullName,
        username: user.username,
        smartersUrl: env.APP_BASE_URL,
        xciptvDns: env.APP_BASE_URL,
        expiresAt: user.expiresAt,
        status: user.status,
        maxConnections: user.maxConnections,
      })),
    );
  }

  async create(req: Request, res: Response) {
    const input = createUserSchema.parse(req.body);
    const defaultUpstream = await adminUpstreamService.ensureDefaultFromEnv();
    const upstreamId = input.upstreamId || defaultUpstream?.id;

    if (!upstreamId || !env.BOOTSTRAP_UPSTREAM_USERNAME || !env.BOOTSTRAP_UPSTREAM_PASSWORD) {
      return res.status(400).json({
        message: "default_upstream_not_configured",
      });
    }

    const user = await adminUserService.create({
      ...input,
      fullName: input.fullName?.trim() || input.username,
      upstreamId,
    });

    return res.status(201).json({
      client: {
        clientName: user.fullName,
        username: user.username,
        smartersUrl: env.APP_BASE_URL,
        xciptvDns: env.APP_BASE_URL,
        expiresAt: user.expiresAt,
        status: user.status,
      },
      textCard: renderClientCard({
        clientName: user.fullName,
        username: input.username,
        password: input.password,
        smartersUrl: env.APP_BASE_URL,
        xciptvDns: env.APP_BASE_URL,
        expiresAt: new Date(input.expiresAt).toLocaleDateString("pt-BR"),
      }),
    });
  }

  async show(req: Request, res: Response) {
    const user = await adminUserService.getById(req.params.id);

    return res.json({
      id: user.id,
      clientName: user.fullName,
      username: user.username,
      smartersUrl: env.APP_BASE_URL,
      xciptvDns: env.APP_BASE_URL,
      expiresAt: user.expiresAt,
      status: user.status,
      maxConnections: user.maxConnections,
      allowedIps: user.allowedIps,
      upstream: user.upstream,
    });
  }

  async update(req: Request, res: Response) {
    const input = updateUserSchema.parse(req.body);
    const user = await adminUserService.update({
      id: req.params.id,
      ...input,
    });

    return res.json({
      id: user.id,
      clientName: user.fullName,
      username: user.username,
      smartersUrl: env.APP_BASE_URL,
      xciptvDns: env.APP_BASE_URL,
      expiresAt: user.expiresAt,
      status: user.status,
      maxConnections: user.maxConnections,
    });
  }

  async renew(req: Request, res: Response) {
    const input = renewUserSchema.parse(req.body);
    const user = await adminUserService.renew(req.params.id, input.expiresAt);

    return res.json({
      id: user.id,
      expiresAt: user.expiresAt,
      status: user.status,
    });
  }

  async suspend(req: Request, res: Response) {
    const user = await adminUserService.suspend(req.params.id);
    return res.json({
      id: user.id,
      status: user.status,
    });
  }

  async activate(req: Request, res: Response) {
    const user = await adminUserService.activate(req.params.id);
    return res.json({
      id: user.id,
      status: user.status,
    });
  }

  async getCard(req: Request, res: Response) {
    const user = await adminUserService.getById(req.params.id);
    const card = renderClientCard({
      clientName: user.fullName,
      username: user.username,
      password: user.password || "●●●●●●●●",
      smartersUrl: env.APP_BASE_URL,
      xciptvDns: env.APP_BASE_URL,
      expiresAt: new Date(user.expiresAt).toLocaleDateString("pt-BR"),
    });

    return res.json({ textCard: card });
  }

  async remove(req: Request, res: Response) {
    await adminUserService.remove(req.params.id);
    return res.status(204).send();
  }
}

export const adminUsersController = new AdminUsersController();
