-- ══════════════════════════════════════════════════════════
-- ScriptForge AI — Supabase 'users' table
-- Run this in: supabase.com → your project → SQL Editor
-- ══════════════════════════════════════════════════════════

create table if not exists users (
  id           uuid default gen_random_uuid() primary key,
  discord_id   text unique not null,
  username     text,
  global_name  text,
  avatar       text,
  plan         text,
  license_key  text,
  expires_at   timestamptz,
  login_count  integer default 1,
  last_login   timestamptz default now(),
  created_at   timestamptz default now()
);

-- Disable RLS so the anon key can read/write
alter table users disable row level security;

-- Index for fast discord_id lookups
create index if not exists users_discord_id_idx on users(discord_id);
