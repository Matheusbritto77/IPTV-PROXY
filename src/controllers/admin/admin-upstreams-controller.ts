// @ts-nocheck
import type { Request, Response } from "express";
import { z } from "zod";
import { adminUpstreamService } from "../../services/admin/admin-upstream-service";

const createUpstreamSchema = z.object({
  name: z.string().min(1),
  smartersUrl: z.string().url(),
  xciptvDns: z.string().url().optional(),
});

const updateUpstreamSchema = z.object({
  name: z.string().min(1).optional(),
  smartersUrl: z.string().url().optional(),
  xciptvDns: z.string().url().optional(),
  status: z.enum(["ACTIVE", "DEGRADED", "DISABLED"]).optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export class AdminUpstreamsController {
  async index(_req: Request, res: Response) {
    return res.json(await adminUpstreamService.list());
  }

  async create(req: Request, res: Response) {
    const input = createUpstreamSchema.parse(req.body);
    return res.status(201).json(await adminUpstreamService.create(input));
  }

  async update(req: Request, res: Response) {
    const input = updateUpstreamSchema.parse(req.body);
    return res.json(await adminUpstreamService.update({ id: req.params.id, ...input }));
  }
}

export const adminUpstreamsController = new AdminUpstreamsController();
