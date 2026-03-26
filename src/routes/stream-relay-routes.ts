// @ts-nocheck
import { Router } from "express";
import { streamRelayController } from "../controllers/internal/stream-relay-controller";
import { edgeSharedSecret } from "../middlewares/edge-shared-secret";

export const streamRelayRouter = Router();

streamRelayRouter.get("/healthz", (_req, res) => {
  res.type("text/plain").send("ok");
});

streamRelayRouter.use(edgeSharedSecret);
streamRelayRouter.get("/internal/edge/relay", (req, res, next) =>
  streamRelayController.relay(req, res).catch(next),
);
