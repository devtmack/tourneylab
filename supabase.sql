create extension if not exists pgcrypto;

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  format text not null,
  status text not null default 'draft',
  payload jsonb not null,
  edit_token_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tournaments enable row level security;

create or replace function public.random_slug()
returns text
language sql
as $$
  select lower(substr(encode(gen_random_bytes(8), 'hex'), 1, 10));
$$;

create or replace function public.create_tournament(
  input_title text,
  input_format text,
  input_status text,
  input_payload jsonb,
  input_edit_token_hash text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_slug text;
begin
  loop
    next_slug := public.random_slug();
    exit when not exists (select 1 from public.tournaments where slug = next_slug);
  end loop;

  insert into public.tournaments (slug, title, format, status, payload, edit_token_hash)
  values (next_slug, input_title, input_format, input_status, input_payload, input_edit_token_hash);

  return next_slug;
end;
$$;

create or replace function public.get_public_tournament(input_slug text)
returns table (
  slug text,
  title text,
  format text,
  status text,
  payload jsonb,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select t.slug, t.title, t.format, t.status, t.payload, t.updated_at
  from public.tournaments t
  where t.slug = input_slug;
$$;

create or replace function public.get_editable_tournament(input_slug text, input_edit_token text)
returns table (
  slug text,
  title text,
  format text,
  status text,
  payload jsonb,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select t.slug, t.title, t.format, t.status, t.payload, t.updated_at
  from public.tournaments t
  where t.slug = input_slug
    and t.edit_token_hash = encode(digest(input_edit_token, 'sha256'), 'hex');
$$;

create or replace function public.update_tournament(
  input_slug text,
  input_edit_token text,
  input_status text,
  input_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tournaments
  set
    title = coalesce(input_payload->>'title', title),
    format = coalesce(input_payload->>'format', format),
    status = input_status,
    payload = input_payload,
    updated_at = now()
  where slug = input_slug
    and edit_token_hash = encode(digest(input_edit_token, 'sha256'), 'hex');

  return found;
end;
$$;

grant execute on function public.create_tournament(text, text, text, jsonb, text) to anon;
grant execute on function public.get_public_tournament(text) to anon;
grant execute on function public.get_editable_tournament(text, text) to anon;
grant execute on function public.update_tournament(text, text, text, jsonb) to anon;
