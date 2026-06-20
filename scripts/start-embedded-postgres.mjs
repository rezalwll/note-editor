import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const databaseDir = "./.local/postgres-win";

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: "postgres",
  port: 5432,
  persistent: true,
  initdbFlags: ["--no-locale", "--encoding=UTF8"],
  onLog: (message) => console.log(String(message).trimEnd()),
  onError: (message) => console.error(String(message).trimEnd()),
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Shutting down embedded Postgres (${signal})...`);
  await pg.stop().catch((error) => {
    console.error("Failed to stop embedded Postgres cleanly:", error);
  });
  process.exit(0);
}

async function main() {
  if (!existsSync(`${databaseDir}/PG_VERSION`)) {
    await pg.initialise();
  }
  await pg.start();
  await pg.createDatabase("notebook").catch((error) => {
    const message = String(error);
    if (!message.includes("already exists")) {
      throw error;
    }
  });

  console.log("Embedded Postgres is running on port 5432.");
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
