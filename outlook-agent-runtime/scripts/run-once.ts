import { pollInbox } from "../src/processor.js";
import { logger } from "../src/lib/logger.js";

/** Manual single-pass ingestion run, for testing without waiting on the scheduler. */
pollInbox()
  .then(() => logger.info("run-once complete"))
  .catch((err) => {
    logger.error("run-once failed", { error: err instanceof Error ? err.message : String(err) });
    process.exitCode = 1;
  });
