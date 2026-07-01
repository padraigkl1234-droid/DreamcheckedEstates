import { startScheduler } from "./scheduler.js";
import { logger } from "./lib/logger.js";

const stopScheduler = startScheduler();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info(`Received ${signal}, shutting down`);
    stopScheduler();
    process.exit(0);
  });
}
