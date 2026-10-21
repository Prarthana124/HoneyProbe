import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { logger } from "../lib/logger";

const allowedEmails = new Set(
  (process.env.HONEYPROBE_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
const cache = new Map<string, { authorized: boolean; expiresAt: number }>();
const cacheDurationMs = 15_000;

export const requireOperator: RequestHandler = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({
      error: "unauthorized",
      detail: "Sign in with an authorized operator account.",
    });
    return;
  }

  if (allowedEmails.size === 0) {
    res.status(503).json({
      error: "access_policy_unavailable",
      detail: "The operator access policy is not configured.",
    });
    return;
  }

  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.authorized) {
      next();
      return;
    }
    res.status(403).json({
      error: "forbidden",
      detail: "This account is not authorized for this workspace.",
    });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const authorized = user.emailAddresses.some(
      (address) =>
        address.verification?.status === "verified" &&
        allowedEmails.has(address.emailAddress.trim().toLowerCase()),
    );
    cache.set(userId, {
      authorized,
      expiresAt: Date.now() + cacheDurationMs,
    });

    if (!authorized) {
      res.status(403).json({
        error: "forbidden",
        detail: "This account is not authorized for this workspace.",
      });
      return;
    }
    next();
  } catch (error) {
    logger.warn(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Could not verify HoneyProbe operator access",
    );
    res.status(503).json({
      error: "access_check_unavailable",
      detail: "Operator access could not be verified. Try again shortly.",
    });
  }
};
