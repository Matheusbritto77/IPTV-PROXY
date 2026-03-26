// @ts-nocheck
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { errorHandler } from "./middlewares/error-handler";
import { streamRelayRouter } from "./routes/stream-relay-routes";

export function createStreamRelayApp() {
  const app = express();
  const isProduction = env.NODE_ENV === "production";

  app.set("trust proxy", true);
  app.use(
    helmet({
      hsts: isProduction,
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    pinoHttp({
      logger,
      redact: ["req.headers.authorization", "req.query.password", "req.params.password"],
    }),
  );

  app.use("/", streamRelayRouter);
  app.use(errorHandler);

  return app;
}
