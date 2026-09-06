import { NextResponse } from "next/server";
import { ConnectionError, parseConnection } from "./connect";
import { checkRateLimit, clientKey } from "./rate-limit";
import type { Connection } from "./types";

/**
 * Shared plumbing for the /api/connect/* routes.
 *
 * Every response here is marked no-store: these payloads describe someone's
 * private schema and must never land in a CDN or browser disk cache.
 */

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  Pragma: "no-cache",
} as const;

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function errorResponse(e: unknown, status = 400) {
  if (e instanceof RateLimitError) {
    return NextResponse.json(
      { error: e.message, hint: e.hint },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(e.retryAfterSeconds) } }
    );
  }
  if (e instanceof ConnectionError) {
    return json({ error: e.message, hint: e.hint }, status);
  }
  const message = e instanceof Error ? e.message : "Something went wrong.";
  return json({ error: message }, 500);
}

export class RateLimitError extends ConnectionError {
  constructor(readonly retryAfterSeconds: number) {
    super(
      "Too many connection attempts — wait a moment and try again.",
      "This limit exists because these endpoints open outbound connections on your behalf."
    );
  }
}

/**
 * Reads and validates the connection from a request body. The credentials are
 * held in this function's return value for the life of the request and are
 * never logged or written anywhere.
 */
export async function readConnection(
  req: Request
): Promise<{ connection: Connection; body: Record<string, unknown> }> {
  const limit = checkRateLimit(clientKey(req));
  if (!limit.allowed) throw new RateLimitError(limit.retryAfterSeconds);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    throw new ConnectionError("Request body must be JSON.");
  }
  return { connection: parseConnection(body.connection), body };
}
