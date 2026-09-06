import { withConnection } from "@/lib/db/connect";
import { errorResponse, json, readConnection } from "@/lib/db/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Verifies credentials and reports what the account can actually see. */
export async function POST(req: Request) {
  try {
    const { connection } = await readConnection(req);

    const result = await withConnection(connection, async (client) => {
      const isPg = client.dialect === "postgres";
      const rows = await client.query<{ schema_name: string; table_count: number | string }>(
        isPg
          ? `SELECT n.nspname AS schema_name, COUNT(*) AS table_count
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relkind IN ('r','p','v','m','f')
               AND n.nspname NOT IN ('pg_catalog','information_schema')
               AND n.nspname NOT LIKE 'pg\\_toast%'
               AND has_table_privilege(c.oid, 'SELECT')
             GROUP BY n.nspname
             ORDER BY 2 DESC`
          : `SELECT TABLE_SCHEMA AS schema_name, COUNT(*) AS table_count
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA NOT IN ('mysql','information_schema','performance_schema','sys')
             GROUP BY TABLE_SCHEMA
             ORDER BY 2 DESC`
      );

      const schemas = rows.map((r) => ({
        name: r.schema_name,
        tableCount: Number(r.table_count),
      }));

      return {
        version: client.version,
        dialect: client.dialect,
        database: connection.database,
        schemas,
        totalTables: schemas.reduce((n, s) => n + s.tableCount, 0),
      };
    });

    return json({ ok: true, ...result });
  } catch (e) {
    return errorResponse(e);
  }
}
