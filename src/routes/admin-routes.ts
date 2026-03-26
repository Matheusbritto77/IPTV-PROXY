// @ts-nocheck
import { Router } from "express";
import { adminUpstreamsController } from "../controllers/admin/admin-upstreams-controller";
import { adminUsersController } from "../controllers/admin/admin-users-controller";
import { adminWebController } from "../controllers/admin/admin-web-controller";
import { adminAuth } from "../middlewares/admin-auth";

export const adminRouter = Router();

adminRouter.use(adminAuth);
adminRouter.get("/", (req, res, next) => adminWebController.dashboard(req, res).catch(next));
adminRouter.get("/users", (req, res, next) => adminUsersController.index(req, res).catch(next));
adminRouter.post("/users", (req, res, next) => adminUsersController.create(req, res).catch(next));
adminRouter.get("/users/:id", (req, res, next) => adminUsersController.show(req, res).catch(next));
adminRouter.patch("/users/:id", (req, res, next) => adminUsersController.update(req, res).catch(next));
adminRouter.post("/users/:id/renew", (req, res, next) => adminUsersController.renew(req, res).catch(next));
adminRouter.post("/users/:id/suspend", (req, res, next) => adminUsersController.suspend(req, res).catch(next));
adminRouter.post("/users/:id/activate", (req, res, next) => adminUsersController.activate(req, res).catch(next));
adminRouter.delete("/users/:id", (req, res, next) => adminUsersController.remove(req, res).catch(next));
adminRouter.get("/upstreams", (req, res, next) => adminUpstreamsController.index(req, res).catch(next));
adminRouter.post("/upstreams", (req, res, next) => adminUpstreamsController.create(req, res).catch(next));
adminRouter.patch("/upstreams/:id", (req, res, next) => adminUpstreamsController.update(req, res).catch(next));
