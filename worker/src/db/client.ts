import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type AppDb = PostgresJsDatabase<typeof schema>;

type DbEnv = {
  HYPERDRIVE: Hyperdrive;
};

const hyperdriveDbCache = new WeakMap<Hyperdrive, AppDb>();

export function getDb(env: DbEnv): AppDb {
  const cached = hyperdriveDbCache.get(env.HYPERDRIVE);
  if (cached) {
    return cached;
  }

  const sql = postgres(env.HYPERDRIVE.connectionString, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  const db = drizzle(sql, { schema });
  hyperdriveDbCache.set(env.HYPERDRIVE, db);
  return db;
}
