import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import app from "./app";
import { logger } from "./lib/logger";

const positivePort = (rawValue: string | undefined, name: string): number => {
  if (!rawValue) throw new Error(`${name} environment variable is required.`);
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0 || value > 65535) {
    throw new Error(`${name} must be a valid TCP port.`);
  }
  return value;
};

const port = positivePort(process.env.PORT, "PORT");
const internalPort = positivePort(
  process.env.HONEYPROBE_INTERNAL_PORT ?? "8180",
  "HONEYPROBE_INTERNAL_PORT",
);
if (port === internalPort) {
  throw new Error("PORT and HONEYPROBE_INTERNAL_PORT must be different.");
}

const pythonArgs = [
  "run",
  "--project",
  "../..",
  "python",
  "-m",
  "uvicorn",
  "honeyprobe.main:app",
  "--app-dir",
  "python",
  "--host",
  "127.0.0.1",
  "--port",
  String(internalPort),
];
if (process.env.NODE_ENV !== "production") pythonArgs.push("--reload");

const pythonProcess = spawn("uv", pythonArgs, {
  cwd: process.cwd(),
  env: { ...process.env, PYTHONUNBUFFERED: "1" },
  stdio: "inherit",
});

let server: ReturnType<typeof app.listen> | null = null;
let shuttingDown = false;
let pythonExited = false;

pythonProcess.on("error", (error) => {
  logger.error({ errorName: error.name }, "Could not start the HoneyProbe Python API");
  process.exit(1);
});
pythonProcess.on("exit", (code, signal) => {
  pythonExited = true;
  if (shuttingDown) return;
  logger.error({ code, signal }, "HoneyProbe Python API exited unexpectedly");
  if (server) {
    server.close(() => process.exit(code && code > 0 ? code : 1));
  } else {
    process.exit(code && code > 0 ? code : 1);
  }
});

async function waitForPythonApi(): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (pythonExited) throw new Error("The Python API exited during startup.");
    try {
      const response = await fetch(
        `http://127.0.0.1:${internalPort}/api/healthz`,
        { signal: AbortSignal.timeout(1000) },
      );
      if (response.ok) return;
    } catch {
      // The Python process may need a few seconds to initialize SQLite.
    }
    await delay(250);
  }
  throw new Error("The Python API did not become healthy within 20 seconds.");
}

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down HoneyProbe services");
  server?.close();
  pythonProcess.kill(signal);
  const hardStop = setTimeout(() => {
    pythonProcess.kill("SIGKILL");
    process.exit(1);
  }, 5000);
  hardStop.unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

async function start(): Promise<void> {
  try {
    await waitForPythonApi();
    server = app.listen(port, "0.0.0.0");
    server.on("error", (error) => {
      logger.error({ errorName: error.name }, "Could not open API gateway port");
      pythonProcess.kill("SIGTERM");
      process.exit(1);
    });
    server.on("listening", () => {
      logger.info({ port, internalPort }, "HoneyProbe API gateway is ready");
    });
  } catch (error) {
    logger.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "HoneyProbe API failed to start",
    );
    pythonProcess.kill("SIGTERM");
    process.exit(1);
  }
}

void start();
