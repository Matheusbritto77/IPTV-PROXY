// @ts-nocheck
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { errorHandler } from "./middlewares/error-handler";
import { requestGuard } from "./middlewares/request-guard";
import { internalRouter } from "./routes/internal-routes";
import { adminRouter } from "./routes/admin-routes";
import { publicRouter } from "./routes/public-routes";

export function createApp() {
  const app = express();
  const isProduction = env.NODE_ENV === "production";

  app.use(
    helmet({
      hsts: isProduction,
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "script-src": ["'self'", "'unsafe-inline'"],
          "script-src-attr": ["'unsafe-inline'"],
          "upgrade-insecure-requests": isProduction ? [] : null,
        },
      },
    }),
  );
  app.use(cors());
  app.use(express.json());
  app.use(
    pinoHttp({
      logger,
      redact: ["req.headers.authorization", "req.query.password", "req.params.password"],
    }),
  );

  app.locals.config = env;
  app.use("/internal", internalRouter);
  app.use(requestGuard);
  app.use("/", publicRouter);
  app.use("/admin", adminRouter);
  app.use(errorHandler);

  return app;
}
