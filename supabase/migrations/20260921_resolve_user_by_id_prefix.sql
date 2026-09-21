-- Public-profile QR resolution needs to look up a user by an 8-hex-char id
-- prefix (the "usr_xxxxxxxx" share slug — see src/lib/publicProfileUrl.ts).
-- PostgREST/Supabase-js cannot ILIKE a uuid column directly (42883: operator
-- does not exist: uuid ~~* unknown), so this RPC does the cast server-side.
-- Read-only, no PII beyond what /p/[slug] already renders publicly.
create or replace function public.resolve_user_by_id_prefix(prefix text)
returns table (
  id uuid,
  name text,
  firm_name text,
  role text,
  custom_role text,
  base_city text,
  base_country text,
  sectors text[],
  intent text[],
  expertise_description text,
  priority_sectors text[],
  geographies text[],
  is_phone_verified boolean,
  profile_completion integer,
  profile_image text
)
language sql
stable
as $$
  select
    u.id, u.name, u.firm_name, u.role, u.custom_role, u.base_city, u.base_country,
    u.sectors, u.intent, u.expertise_description, u.priority_sectors, u.geographies,
    u.is_phone_verified, u.profile_completion, u.profile_image
  from public.users u
  where u.id::text ilike prefix || '%'
  limit 1;
$$;
