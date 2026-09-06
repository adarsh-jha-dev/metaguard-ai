import dns from "node:dns/promises";
import net from "node:net";
import type { Connection, Dialect } from "./types";
import { DEFAULT_PORTS as SHARED_DEFAULT_PORTS } from "./url";

export { parseConnectionUrl } from "./url";

/**
 * Connection handling for user-supplied databases.
 *
 * Guarantees this module is responsible for:
 *  1. Credentials are never written to disk, a database, a log line, or an env var.
 *  2. The server refuses to dial private/internal network addresses (SSRF guard),
 *     unless explicitly allowed for local development.
 *  3. Every session is opened read-only with hard statement timeouts.
 *  4. Pools are destroyed in a `finally` block, so nothing outlives the request.
 */

const CONNECT_TIMEOUT_MS = 10_000;
const STATEMENT_TIMEOUT_MS = 20_000;

/** Set ALLOW_PRIVATE_DB_HOSTS=true to connect to localhost/LAN databases in dev. */
const ALLOW_PRIVATE_HOSTS = process.env.ALLOW_PRIVATE_DB_HOSTS === "true";

export const DEFAULT_PORTS = SHARED_DEFAULT_PORTS;

export class ConnectionError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message);
    this.name = "ConnectionError";
  }
}

// ── Input validation ───────────────────────────────────────────────────────

export function parseConnection(raw: unknown): Connection {
  if (!raw || typeof raw !== "object") {
    throw new ConnectionError("No database connection supplied.");
  }
  const c = raw as Record<string, unknown>;

  const dialect = String(c.dialect ?? "");
  if (dialect !== "postgres" && dialect !== "mysql") {
    throw new ConnectionError(`Unsupported database type "${dialect}". Use "postgres" or "mysql".`);
  }

  const host = String(c.host ?? "").trim();
  if (!host) throw new ConnectionError("Host is required.");
  if (host.length > 255) throw new ConnectionError("Host is too long.");

  const port = Number(c.port ?? DEFAULT_PORTS[dialect]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConnectionError("Port must be a whole number between 1 and 65535.");
  }

  const database = String(c.database ?? "").trim();
  if (!database) throw new ConnectionError("Database name is required.");

  const user = String(c.user ?? "").trim();
  if (!user) throw new ConnectionError("Username is required.");

  const ssl = String(c.ssl ?? "require");
  if (ssl !== "require" && ssl !== "prefer" && ssl !== "disable") {
    throw new ConnectionError(`Invalid SSL mode "${ssl}".`);
  }

  const schema = c.schema ? String(c.schema).trim() : undefined;

  return {
    dialect,
    host,
    port,
    database,
    user,
    password: String(c.password ?? ""),
    ssl,
    sslRejectUnauthorized: c.sslRejectUnauthorized !== false,
    schema: schema || undefined,
  };
}

// ── SSRF guard ─────────────────────────────────────────────────────────────

/** RFC1918 + loopback + link-local + CGNAT + reserved ranges. */
function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // "this network"
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0];
  if (addr === "::1" || addr === "::") return true;
  if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // unique local
  if (addr.startsWith("fe80")) return true; // link-local
  if (addr.startsWith("ff")) return true; // multicast
  // IPv4-mapped (::ffff:10.0.0.1)
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

function isPrivateAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return true;
}

/**
 * Resolves a hostname and rejects it if *any* resolved address is internal.
 * Returns a public IP to dial directly, which also closes the DNS-rebinding
 * window between this check and the driver's own lookup.
 */
export async function resolveSafeHost(host: string): Promise<string> {
  if (ALLOW_PRIVATE_HOSTS) return host;

  let addresses: string[];
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    try {
      const records = await dns.lookup(host, { all: true, verbatim: true });
      addresses = records.map((r) => r.address);
    } catch {
      throw new ConnectionError(
        `Could not resolve host "${host}".`,
        "Check the hostname, or whether the database is reachable from the public internet."
      );
    }
  }

  if (addresses.length === 0) throw new ConnectionError(`Host "${host}" has no DNS records.`);

  const blocked = addresses.filter(isPrivateAddress);
  if (blocked.length > 0) {
    throw new ConnectionError(
      `Refusing to connect to "${host}" — it resolves to an internal address (${blocked[0]}).`,
      "This deployment only connects to publicly reachable databases. Run MetaGuard locally with ALLOW_PRIVATE_DB_HOSTS=true to use localhost or a private network."
    );
  }

  return addresses[0];
}

// ── Query interface ────────────────────────────────────────────────────────

export type Client = {
  dialect: Dialect;
  version: string;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
};

/** Strips a password out of driver error text before it reaches the client. */
function sanitize(message: string, password: string): string {
  let out = message;
  if (password && password.length > 2) out = out.split(password).join("******");
  return out;
}

async function openPostgres(conn: Connection, address: string): Promise<{ client: Client; close: () => Promise<void> }> {
  const { Client: PgClient } = await import("pg");

  const build = (useSsl: boolean) =>
    new PgClient({
      host: address,
      port: conn.port,
      database: conn.database,
      user: conn.user,
      password: conn.password,
      // Dial the vetted IP but keep the original hostname for TLS verification.
      ssl: useSsl
        ? { rejectUnauthorized: conn.sslRejectUnauthorized !== false, servername: conn.host }
        : false,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      statement_timeout: STATEMENT_TIMEOUT_MS,
      query_timeout: STATEMENT_TIMEOUT_MS,
      application_name: "metaguard-ai",
    });

  let pg = build(conn.ssl !== "disable");
  try {
    await pg.connect();
  } catch (e) {
    if (conn.ssl === "prefer") {
      // Retry once without TLS — servers that don't speak SSL reject the handshake.
      await pg.end().catch(() => {});
      pg = build(false);
      await pg.connect();
    } else {
      await pg.end().catch(() => {});
      throw e;
    }
  }

  // Belt and braces: even though we only ever issue SELECTs, make writes impossible.
  await pg.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
  await pg.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
  await pg.query(`SET idle_in_transaction_session_timeout = ${STATEMENT_TIMEOUT_MS}`);

  const versionRows = await pg.query<{ version: string }>("SELECT version() AS version");

  return {
    client: {
      dialect: "postgres",
      version: versionRows.rows[0]?.version ?? "PostgreSQL",
      async query<T>(sql: string, params?: unknown[]) {
        const res = await pg.query(sql, params as never[]);
        return res.rows as T[];
      },
    },
    close: async () => {
      await pg.end().catch(() => {});
    },
  };
}

async function openMysql(conn: Connection, address: string): Promise<{ client: Client; close: () => Promise<void> }> {
  const mysql = await import("mysql2/promise");

  const create = (useSsl: boolean) =>
    mysql.createConnection({
      host: address,
      port: conn.port,
      database: conn.database,
      user: conn.user,
      password: conn.password,
      // mysql2 forwards ssl options straight to tls.connect, so `servername`
      // works even though it is missing from the driver's published types.
      ssl: useSsl
        ? ({
            rejectUnauthorized: conn.sslRejectUnauthorized !== false,
            servername: conn.host,
          } as unknown as string)
        : undefined,
      connectTimeout: CONNECT_TIMEOUT_MS,
      // Never let the driver run more than one statement per query() call.
      multipleStatements: false,
      dateStrings: true,
    });

  let my;
  try {
    my = await create(conn.ssl !== "disable");
  } catch (e) {
    if (conn.ssl === "prefer") {
      my = await create(false);
    } else {
      throw e;
    }
  }

  await my.query("SET SESSION TRANSACTION READ ONLY");
  // max_execution_time only exists on MySQL 5.7.8+; ignore it elsewhere (MariaDB).
  await my.query(`SET SESSION max_execution_time = ${STATEMENT_TIMEOUT_MS}`).catch(() => {});

  const [versionRows] = await my.query<never[]>("SELECT VERSION() AS version");
  const version = (versionRows as unknown as { version: string }[])[0]?.version ?? "MySQL";

  return {
    client: {
      dialect: "mysql",
      version: `MySQL ${version}`,
      async query<T>(sql: string, params?: unknown[]) {
        const [rows] = await my.query(sql, params);
        return rows as T[];
      },
    },
    close: async () => {
      await my.end().catch(() => {});
    },
  };
}

/**
 * Opens a short-lived read-only connection, runs `fn`, and always tears the
 * connection down. This is the only way the rest of the app touches a user DB.
 */
export async function withConnection<T>(conn: Connection, fn: (client: Client) => Promise<T>): Promise<T> {
  const address = await resolveSafeHost(conn.host);

  let handle: { client: Client; close: () => Promise<void> };
  try {
    handle = conn.dialect === "postgres" ? await openPostgres(conn, address) : await openMysql(conn, address);
  } catch (e) {
    throw toFriendlyError(e, conn);
  }

  try {
    return await fn(handle.client);
  } catch (e) {
    throw toFriendlyError(e, conn);
  } finally {
    await handle.close();
  }
}

/** Turns raw driver errors into something a user can act on, with no secrets. */
export function toFriendlyError(e: unknown, conn: Connection): ConnectionError {
  if (e instanceof ConnectionError) return e;

  const raw = e instanceof Error ? e.message : String(e);
  const msg = sanitize(raw, conn.password);
  const code = (e as { code?: string })?.code;

  if (code === "ECONNREFUSED")
    return new ConnectionError(
      `Connection refused by ${conn.host}:${conn.port}.`,
      "Check the port, and that your database allows connections from outside its own network."
    );
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT" || /timeout/i.test(msg))
    return new ConnectionError(
      `Timed out connecting to ${conn.host}:${conn.port}.`,
      "Most managed databases block unknown IPs by default — allowlist your deployment's egress IP, or enable public access."
    );
  if (code === "ENOTFOUND" || code === "EAI_AGAIN")
    return new ConnectionError(`Host "${conn.host}" could not be found.`);
  if (code === "28P01" || code === "ER_ACCESS_DENIED_ERROR" || /password authentication failed|access denied/i.test(msg))
    return new ConnectionError("Authentication failed — check the username and password.");
  if (code === "3D000" || code === "ER_BAD_DB_ERROR" || /database .* does not exist|unknown database/i.test(msg))
    return new ConnectionError(`Database "${conn.database}" does not exist on this server.`);
  if (/self.signed|certificate/i.test(msg))
    return new ConnectionError(
      "TLS certificate could not be verified.",
      "If your provider uses a self-signed certificate, turn off strict certificate checking."
    );
  if (/does not support ssl|server does not support SSL/i.test(msg))
    return new ConnectionError("This server does not support SSL.", 'Set SSL mode to "prefer" or "disable".');

  return new ConnectionError(msg);
}
