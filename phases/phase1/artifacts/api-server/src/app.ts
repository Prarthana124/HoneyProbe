import express, { type RequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { createProxyMiddleware } from "http-proxy-middleware";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { requireOperator } from "./middlewares/operatorAuth";
import { logger } from "./lib/logger";

const app = express();
const internalPort = Number(process.env.HONEYPROBE_INTERNAL_PORT ?? "8180");
const pythonOrigin = `http://127.0.0.1:${internalPort}`;
const allowedOrigins = new Set(
  (process.env.HONEYPROBE_CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Clerk's Frontend API proxy must run before body parsers so it can stream raw requests.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin) return callback(null, false);
      return callback(null, allowedOrigins.has(origin));
    },
  }),
);

const clerkConfigured = Boolean(
  process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY,
);

if (clerkConfigured) {
  app.use(
    clerkMiddleware((req) => ({
      publishableKey: publishableKeyFromHost(
        getClerkProxyHost(req) ?? "",
        process.env.CLERK_PUBLISHABLE_KEY,
      ),
    })),
  );
} else {
  logger.warn(
    "Clerk is not configured; protected API routes will remain locked",
  );
  app.use((req, res, next) => {
    if (
      !req.path.startsWith("/api") ||
      req.path === "/api/health" ||
      req.path === "/api/healthz"
    ) {
      next();
      return;
    }
    res.status(503).json({
      error: "authentication_unavailable",
      detail: "Clerk is not configured; protected API routes remain locked.",
    });
  });
}

const healthHandler: RequestHandler = async (_req, res) => {
  try {
    const response = await fetch(`${pythonOrigin}/api/healthz`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) {
      res.status(503).json({ status: "unavailable" });
      return;
    }
    res.status(200).json({ status: "healthy" });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
};

// Keep only shallow health checks public for workflow readiness.
app.get("/api/health", healthHandler);
app.get("/api/healthz", healthHandler);

app.get("/api/auth/status", requireOperator, (_req, res) => {
  res.status(200).json({ authorized: true });
});

// Forward all data routes only after Clerk verifies the session and its email allowlist.
// No JSON body parser is mounted here, so request bodies stream unchanged to FastAPI.
const apiProxy = createProxyMiddleware({
  target: pythonOrigin,
  changeOrigin: true,
  proxyTimeout: 30_000,
  timeout: 30_000,
});

app.use((req, res, next): void => {
  if (req.path === "/api" || req.path.startsWith("/api/")) {
    void requireOperator(req, res, () => {
      void apiProxy(req, res, next);
    });
    return;
  }
  next();
});

export default app;
