CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "pages_title_trgm_idx"
  ON "pages" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "pages_body_text_trgm_idx"
  ON "pages" USING GIN ("body_text" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "notebooks_name_trgm_idx"
  ON "notebooks" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "notebook_groups_name_trgm_idx"
  ON "notebook_groups" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "attachments_file_name_trgm_idx"
  ON "attachments" USING GIN ("file_name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "page_tags_value_trgm_idx"
  ON "page_tags" USING GIN ("value" gin_trgm_ops);
