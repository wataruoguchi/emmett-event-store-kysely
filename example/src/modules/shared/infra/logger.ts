import { Context } from "effect";
import { pino } from "pino";

export type Logger = typeof logger;
export const logger = pino({
  level: "info",
  ...(process.env.NODE_ENV === "production"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
          },
        },
      }
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
          },
        },
        level: "debug",
      }),
});

export class LoggerService extends Context.Tag("LoggerService")<
  LoggerService,
  Logger
>() {}
