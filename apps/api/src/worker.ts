import { loadConfig } from "./config.js";
import { createDatabase } from "./db/client.js";

const config = loadConfig();
const { pool } = createDatabase(config);

let resolveShutdown: (() => void) | undefined;
const shutdown = new Promise<void>((resolve) => {
  resolveShutdown = resolve;
});
const keepAlive = setInterval(() => undefined, 30_000);

process.once("SIGINT", () => resolveShutdown?.());
process.once("SIGTERM", () => resolveShutdown?.());

await shutdown;
clearInterval(keepAlive);

await pool.end();
