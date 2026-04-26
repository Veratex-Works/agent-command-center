-- One-time backfill: users in auth.users without a public.profiles row (e.g. created while trigger failed or before trigger existed).
-- Safe to re-run: skips existing ids.

insert into public.profiles (id, email, role)
select u.id, u.email, 'user'::text
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
