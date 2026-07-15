import "dotenv/config";

import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/notebook";

const pool = new Pool({ connectionString, max: 4 });

export const E2E_PASSWORD = "Notava-e2e-password-2026";
export const E2E_USER_PREFIX = "e2e_";

let passwordHashPromise: Promise<string> | null = null;

export type E2EAccount = {
  id: string;
  username: string;
  password: string;
};

export type E2EPageRecord = {
  id: string;
  userId: string;
  notebookId: string;
  title: string;
  bodyText: string;
  deletedAt: Date | null;
};

export type E2EWorkspace = {
  groupId: string;
  notebookId: string;
  pages: Array<{
    id: string;
    title: string;
  }>;
};

function createCuid() {
  return `c${randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

function getPasswordHash() {
  passwordHashPromise ??= argon2.hash(E2E_PASSWORD);
  return passwordHashPromise;
}

export async function createE2EAccount(label: string): Promise<E2EAccount> {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 20);
  const username = `${E2E_USER_PREFIX}${safeLabel}_${suffix}`;
  const id = createCuid();
  await pool.query(
    `INSERT INTO users
      (id, username, email, display_name, password_hash, must_change_password, created_at, updated_at)
     VALUES (
       $1, $2, $3, $4, $5, false,
       CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
       CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
     )`,
    [
      id,
      username,
      `${username}@example.test`,
      `E2E ${safeLabel || "user"}`,
      await getPasswordHash(),
    ],
  );

  return { id, username, password: E2E_PASSWORD };
}

export async function deleteE2EAccount(userId: string) {
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
}

export async function cleanupE2EAccounts() {
  await pool.query("DELETE FROM users WHERE username LIKE $1", [
    `${E2E_USER_PREFIX}%`,
  ]);
}

export async function createE2EWorkspace(
  userId: string,
  options: {
    groupName?: string;
    notebookName?: string;
    pages?: Array<{ title: string; bodyText?: string }>;
  } = {},
): Promise<E2EWorkspace> {
  const pageInputs = options.pages ?? [{ title: "E2E page", bodyText: "" }];
  const groupId = createCuid();
  const notebookId = createCuid();
  await pool.query(
    `INSERT INTO notebook_groups (id, user_id, name, created_at, updated_at)
     VALUES (
       $1, $2, $3,
       CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
       CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
     )`,
    [groupId, userId, options.groupName ?? "E2E group"],
  );
  await pool.query(
    `INSERT INTO notebooks (id, user_id, group_id, name, created_at, updated_at)
     VALUES (
       $1, $2, $3, $4,
       CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
       CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
     )`,
    [notebookId, userId, groupId, options.notebookName ?? "E2E notebook"],
  );
  const pages = [];

  for (const [sortOrder, input] of pageInputs.entries()) {
    const id = createCuid();
    const bodyText = input.bodyText ?? "";
    await pool.query(
      `INSERT INTO pages
        (id, user_id, notebook_id, title, body_html, body_text, sort_order, created_at, updated_at)
       VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
         CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
       )`,
      [
        id,
        userId,
        notebookId,
        input.title,
        bodyText ? `<p>${bodyText}</p>` : "",
        bodyText,
        sortOrder,
      ],
    );
    pages.push({ id, title: input.title });
  }

  return { groupId, notebookId, pages };
}

export async function findGroup(userId: string, name: string) {
  const result = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM notebook_groups
     WHERE user_id = $1 AND name = $2
     ORDER BY created_at DESC LIMIT 1`,
    [userId, name],
  );
  return result.rows[0] ?? null;
}

export async function findNotebook(
  userId: string,
  groupId: string,
  name: string,
) {
  const result = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM notebooks
     WHERE user_id = $1 AND group_id = $2 AND name = $3
     ORDER BY created_at DESC LIMIT 1`,
    [userId, groupId, name],
  );
  return result.rows[0] ?? null;
}

export async function findPage(pageId: string): Promise<E2EPageRecord | null> {
  const result = await pool.query<{
    id: string;
    user_id: string;
    notebook_id: string;
    title: string;
    body_text: string;
    deleted_at: Date | null;
  }>(
    `SELECT id, user_id, notebook_id, title, body_text, deleted_at
     FROM pages WHERE id = $1 LIMIT 1`,
    [pageId],
  );
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        userId: row.user_id,
        notebookId: row.notebook_id,
        title: row.title,
        bodyText: row.body_text,
        deletedAt: row.deleted_at,
      }
    : null;
}

export async function findPageByTitle(
  userId: string,
  notebookId: string,
  title: string,
) {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM pages
     WHERE user_id = $1 AND notebook_id = $2 AND title = $3
     ORDER BY created_at DESC LIMIT 1`,
    [userId, notebookId, title],
  );
  return result.rows[0] ?? null;
}

export async function findFirstPageInNotebook(
  userId: string,
  notebookId: string,
) {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM pages
     WHERE user_id = $1 AND notebook_id = $2
     ORDER BY sort_order ASC, created_at ASC LIMIT 1`,
    [userId, notebookId],
  );
  return result.rows[0] ?? null;
}

export async function findPageTombstone(userId: string, pageId: string) {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM entity_tombstones
     WHERE user_id = $1 AND entity_type = 'page' AND entity_id = $2
     LIMIT 1`,
    [userId, pageId],
  );
  return result.rows[0] ?? null;
}
