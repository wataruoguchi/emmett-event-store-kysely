import type { Kysely, Transaction } from "kysely";
import type { EventStoreDBSchema } from "./db-schema.js";

export type DatabaseExecutor = Pick<
  Kysely<EventStoreDBSchema> | Transaction<EventStoreDBSchema>,
  "selectFrom" | "insertInto" | "updateTable" | "transaction"
> & {
  // Kysely builders carry `.execute()`/`.executeTakeFirst()`, but if the caller passes a narrower type,
  // we still accept it as long as it provides these at call sites.
  execute?<T>(query: unknown): Promise<T>;
};

export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  warn?: (obj: unknown, msg?: string) => void;
  debug?: (obj: unknown, msg?: string) => void;
};

export type Dependencies = {
  db: DatabaseExecutor;
  logger: Logger;
};

export type ExtendedOptions = {
  partition?: string;
  streamType?: string;
};

export const PostgreSQLEventStoreDefaultStreamVersion = 0n;
export const DEFAULT_PARTITION = "default_partition" as const;
