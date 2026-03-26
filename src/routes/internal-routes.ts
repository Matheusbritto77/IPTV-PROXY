// @ts-nocheck
import { Router } from "express";
import { edgeController } from "../controllers/internal/edge-controller";
import { edgeSharedSecret } from "../middlewares/edge-shared-secret";

export const internalRouter = Router();

internalRouter.use(edgeSharedSecret);
internalRouter.get("/edge/authorize-stream", (req, res, next) =>
  edgeController.authorizeStream(req, res).catch(next),
);
