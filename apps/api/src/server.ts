import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db/client.js";
import { createFakeProviders } from "./providers/fakes.js";

const config = loadConfig();
const { db, pool } = createDatabase(config);
const app = await buildApp({ config, db, providers: createFakeProviders() });

const shutdown = async () => {
  await app.close();
  await pool.end();
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await app.listen({ host: "0.0.0.0", port: config.PORT });

