import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export function databaseForTest(t) {
  const sql = new DatabaseSync(":memory:");
  t.after(() => sql.close());
  const migrations = new URL("../migrations/", import.meta.url);
  for (const migration of readdirSync(migrations).filter(name => name.endsWith(".sql")).sort()) {
    sql.exec(readFileSync(new URL(migration, migrations), "utf8"));
  }
  const database = {
    async batch(statements) {
      sql.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map(statement => ({ results: statement.batchRows() }));
        sql.exec("COMMIT");
        return results;
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
    prepare(statement) {
      return {
        bind(...values) {
          const named = Object.fromEntries(values.map((value, index) => [String(index + 1), value]));
          return {
            first: async () => sql.prepare(statement).get(named) ?? null,
            all: async () => ({ results: sql.prepare(statement).all(named) }),
            batchRows: () => sql.prepare(statement).all(named),
          };
        },
      };
    },
  };
  return { database, sql };
}
