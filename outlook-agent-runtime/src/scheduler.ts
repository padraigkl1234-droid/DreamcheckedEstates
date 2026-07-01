import { config } from "./config.js";
import { pollInbox } from "./processor.js";
import { compileAndSendDigest } from "./reporter/digest.js";
import { logger } from "./lib/logger.js";

function getLocalParts(timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { date: `${map.year}-${map.month}-${map.day}`, time: `${map.hour}:${map.minute}` };
}

let lastDigestDate: string | undefined;

async function tick(): Promise<void> {
  try {
    await pollInbox();
  } catch (err) {
    logger.error("Inbox poll failed, will retry next tick", { error: err instanceof Error ? err.message : String(err) });
  }

  try {
    const { date, time } = getLocalParts(config.DIGEST_TIMEZONE);
    if (time >= config.DIGEST_TIME && lastDigestDate !== date) {
      await compileAndSendDigest();
      lastDigestDate = date;
    }
  } catch (err) {
    logger.error("Digest compilation failed", { error: err instanceof Error ? err.message : String(err) });
  }
}

/** Starts the poll loop. Returns a stop function for graceful shutdown. */
export function startScheduler(): () => void {
  const intervalMs = config.POLL_INTERVAL_MINUTES * 60_000;
  logger.info(
    `Starting scheduler: polling every ${config.POLL_INTERVAL_MINUTES} minute(s), digest at ${config.DIGEST_TIME} ${config.DIGEST_TIMEZONE}`
  );

  void tick();
  const handle = setInterval(() => void tick(), intervalMs);

  return () => clearInterval(handle);
}
