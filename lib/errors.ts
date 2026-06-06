export function getFriendlyDatabaseError(error: unknown) {
  if (!(error instanceof Error)) {
    return null;
  }

  if (error.message === "DATABASE_UNAVAILABLE") {
    return "Database is not reachable. Start Postgres and try again.";
  }

  if (error.message.startsWith("DATABASE_REQUEST_FAILED:")) {
    return "Database schema is not ready yet. Run the Prisma migration and seed commands.";
  }

  return null;
}
