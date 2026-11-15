import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createApp } from "./app";
const database = resolve(
  process.env.DATABASE_PATH ?? ".data/mission-control.sqlite",
);
mkdirSync(dirname(database), { recursive: true });
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer between 1 and 65535.");
const { app, store } = createApp(database);
const server = app.listen(port, "127.0.0.1", () => {
  process.stdout.write(
    `Mission Control local REST API: http://127.0.0.1:${port}/api/v1/health\n`,
  );
});
const shutdown = () =>
  server.close(() => {
    store.close();
    process.exit(0);
  });
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
