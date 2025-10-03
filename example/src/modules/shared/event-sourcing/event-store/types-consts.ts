import type { DatabaseExecutor } from "../../infra/db.js";
import type { Logger } from "../../infra/logger.js";

export type Dependencies = {
  db: DatabaseExecutor;
  logger: Logger;
};

// This is how emmett extends the options of the readStream and appendToStream functions.
export type ExtendedOptions = {
  partition?: string;
  streamType?: string;
};

export const PostgreSQLEventStoreDefaultStreamVersion = 0n;
export const DEFAULT_PARTITION = "default_partition" as const;
