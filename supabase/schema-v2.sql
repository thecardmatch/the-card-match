-- ─── The Card Match — Schema v2 ──────────────────────────────────────────────
-- Paste this entire script into Supabase SQL Editor and click Run.
-- Safe to re-run — every statement uses IF NOT EXISTS / exception guards.

-- Required for fast trigram autocomplete.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── searchable_entities ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS searchable_entities (
  id           uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text  NOT NULL,
  category     text  NOT NULL,
  ebay_keyword text  NOT NULL,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (name, category)
);
ALTER TABLE searchable_entities ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "public_read_entities" ON searchable_entities FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_entities_name_trgm  ON searchable_entities USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_entities_name_lower ON searchable_entities (lower(name) text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_entities_category   ON searchable_entities (category);

-- ─── entity_card_cache ────────────────────────────────────────────────────────
-- Per-entity eBay results cache. One row per entity. TTL = 30 min.
CREATE TABLE IF NOT EXISTS entity_card_cache (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id  uuid NOT NULL REFERENCES searchable_entities (id) ON DELETE CASCADE,
  cards      jsonb NOT NULL DEFAULT '[]',
  fetched_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (entity_id)
);
ALTER TABLE entity_card_cache ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "public_read_entity_cache" ON entity_card_cache FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_entity_cache_lookup ON entity_card_cache (entity_id, expires_at);

-- ─── broad_category_cache ─────────────────────────────────────────────────────
-- Shared deck for all users browsing a category. TTL = 15 min.
-- Key format: categories|sort|conditions|listingType|minPrice|maxPrice|showBulk
CREATE TABLE IF NOT EXISTS broad_category_cache (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key  text NOT NULL UNIQUE,
  cards      jsonb NOT NULL DEFAULT '[]',
  fetched_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);
ALTER TABLE broad_category_cache ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "public_read_broad_cache" ON broad_category_cache FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_broad_cache_lookup ON broad_category_cache (cache_key, expires_at);
