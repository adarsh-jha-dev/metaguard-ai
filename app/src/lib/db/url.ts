import type { Connection, Dialect } from "./types";

/**
 * Connection-URL parsing, kept free of Node built-ins so the connect form can
 * use the exact same logic the server does.
 */

export const DEFAULT_PORTS: Record<Dialect, number> = {
  postgres: 5432,
  mysql: 3306,
};

export class InvalidUrlError extends Error {}

export function parseConnectionUrl(url: string): Partial<Connection> {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new InvalidUrlError("That doesn't look like a valid connection URL.");
  }

  const proto = parsed.protocol.replace(":", "").toLowerCase();
  const dialect: Dialect | null =
    proto === "postgres" || proto === "postgresql"
      ? "postgres"
      : proto === "mysql" || proto === "mariadb"
        ? "mysql"
        : null;
  if (!dialect) {
    throw new InvalidUrlError(`Unsupported URL scheme "${proto}://". Use postgres:// or mysql://.`);
  }

  const sslMode = parsed.searchParams.get("sslmode") ?? parsed.searchParams.get("ssl");
  const ssl: Connection["ssl"] =
    sslMode === "disable" || sslMode === "false"
      ? "disable"
      : sslMode === "prefer" || sslMode === "allow"
        ? "prefer"
        : "require";

  return {
    dialect,
    host: decodeURIComponent(parsed.hostname),
    port: parsed.port ? Number(parsed.port) : DEFAULT_PORTS[dialect],
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    ssl,
    schema: parsed.searchParams.get("schema") ?? undefined,
  };
}
