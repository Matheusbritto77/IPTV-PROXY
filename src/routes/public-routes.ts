// @ts-nocheck
import { Router } from "express";
import { healthController } from "../controllers/public/health-controller";
import { portalController } from "../controllers/public/portal-controller";
import { xtreamController } from "../controllers/public/xtream-controller";

export const publicRouter = Router();
const forwardStream =
  (streamType: "live" | "movie" | "series") => (req, res, next) => {
    req.params.streamType = streamType;
    return xtreamController.stream(req, res).catch(next);
  };

publicRouter.get("/health", (req, res) => healthController.index(req, res));
publicRouter.get("/health/details", (req, res, next) => healthController.detailed(req, res).catch(next));
publicRouter.get("/player_api.php", (req, res, next) => xtreamController.playerApi(req, res).catch(next));
publicRouter.get("/panel_api.php", (req, res, next) => xtreamController.playerApi(req, res).catch(next));
publicRouter.get("/get.php", (req, res, next) => xtreamController.playlist(req, res).catch(next));
publicRouter.get("/xmltv.php", (req, res, next) => xtreamController.xmltv(req, res).catch(next));
publicRouter.get("/portal.php", (req, res, next) => portalController.handle(req, res).catch(next));
publicRouter.get("/live/:username/:password/:streamId.:extension", forwardStream("live"));
publicRouter.get("/movie/:username/:password/:streamId.:extension", forwardStream("movie"));
publicRouter.get("/series/:username/:password/:streamId.:extension", forwardStream("series"));
