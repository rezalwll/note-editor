CREATE TABLE users (
  id TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);

CREATE TABLE notebooks (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL,
  CONSTRAINT notebooks_pkey PRIMARY KEY (id)
);

CREATE TABLE pages (
  id TEXT NOT NULL,
  notebook_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL,
  CONSTRAINT pages_pkey PRIMARY KEY (id)
);

CREATE TABLE page_tags (
  page_id TEXT NOT NULL,
  value TEXT NOT NULL,
  CONSTRAINT page_tags_pkey PRIMARY KEY (page_id, value)
);

CREATE TABLE attachments (
  id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT attachments_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX attachments_storage_key_key ON attachments(storage_key);
CREATE INDEX pages_notebook_id_archived_idx ON pages(notebook_id, archived);
CREATE INDEX page_tags_value_idx ON page_tags(value);
CREATE INDEX attachments_page_id_idx ON attachments(page_id);

ALTER TABLE pages
  ADD CONSTRAINT pages_notebook_id_fkey
  FOREIGN KEY (notebook_id) REFERENCES notebooks(id)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE page_tags
  ADD CONSTRAINT page_tags_page_id_fkey
  FOREIGN KEY (page_id) REFERENCES pages(id)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE attachments
  ADD CONSTRAINT attachments_page_id_fkey
  FOREIGN KEY (page_id) REFERENCES pages(id)
  ON DELETE CASCADE ON UPDATE CASCADE;
