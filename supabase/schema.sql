-- ============================================================
-- Growth Atlas SEO Ops - Supabase schema
-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run
-- ============================================================

-- 1) PROFILES (one row per logged-in user, holds their role)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'member',   -- 'admin' or 'member'
  created_at timestamptz default now()
);

-- auto-create a profile whenever a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) CLIENTS (the SEO projects)
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  niche text default '',
  status text default 'active',           -- lead / upcoming / active / paused / ended / loss
  source text default 'Direct',           -- Direct / Fiverr / Referral / Other
  package text default 'Standard',
  fee numeric default 0,
  team_member text default '',
  start_month text default '',            -- 'YYYY-MM'
  renewal_month text default '',
  risk text default 'low',
  notes text default '',
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- 3) TASKS (SEO task board: guest post, on-page, backlink, anchor text...)
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  title text not null,
  type text default 'other',              -- guest / onpage / backlink / anchor / blog / audit / schema / other
  assignee text default '',
  status text default 'todo',             -- todo / doing / done
  due date,
  created_at timestamptz default now()
);

-- 4) DELIVERABLES (monthly counts per client)
create table if not exists public.deliverables (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  month text not null,                    -- 'YYYY-MM'
  articles int default 0,
  backlinks int default 0,
  audits int default 0,
  traffic int default 0,
  unique (client_id, month)
);

-- 5) KEYWORDS (rank tracking per client)
create table if not exists public.keywords (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  kw text default '',
  current_rank int,
  prev_rank int
);

-- 6) PAYMENTS (revenue: what each client owes / paid each month)
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  month text not null,                    -- 'YYYY-MM'
  amount numeric default 0,
  status text default 'pending',          -- pending / paid / overdue
  paid_date date,
  created_at timestamptz default now(),
  unique (client_id, month)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Team model: any logged-in member can see and work the board.
-- Only admins can delete clients.
-- ============================================================
alter table public.profiles     enable row level security;
alter table public.clients      enable row level security;
alter table public.tasks        enable row level security;
alter table public.deliverables enable row level security;
alter table public.keywords     enable row level security;
alter table public.payments     enable row level security;

-- helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- profiles: everyone signed in can read; you can update your own
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid());

-- clients: read + insert + update for any member; delete admin-only
drop policy if exists clients_read on public.clients;
create policy clients_read on public.clients for select to authenticated using (true);
drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients for insert to authenticated with check (true);
drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients for update to authenticated using (true);
drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients for delete to authenticated using (public.is_admin());

-- tasks / deliverables / keywords: full access for any member
do $$
declare t text;
begin
  foreach t in array array['tasks','deliverables','keywords','payments'] loop
    execute format('drop policy if exists %I_all on public.%I;', t, t);
    execute format('create policy %I_all on public.%I for all to authenticated using (true) with check (true);', t, t);
  end loop;
end $$;

-- ============================================================
-- After running: sign up in the app, then make yourself admin:
--   update public.profiles set role = 'admin' where full_name = 'your@email.com';
-- ============================================================
