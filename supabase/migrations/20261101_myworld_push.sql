-- MY WORLD push notifications of ski resorts. Self-contained (prefix myworld_), so it can be moved to any Supabase project:
-- run this file there, deploy supabase/functions/myworld-push, insert the VAPID keys into myworld_config.
-- Only the edge function (service role) touches these tables: RLS on, no policies.
create table if not exists public.myworld_push_subs (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  resorts text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.myworld_push_sent (
  endpoint text not null references public.myworld_push_subs(endpoint) on delete cascade,
  notice_id text not null,
  sent_at timestamptz not null default now(),
  primary key (endpoint, notice_id)
);
create index if not exists myworld_push_sent_at on public.myworld_push_sent (sent_at);
create table if not exists public.myworld_config (
  key text primary key,
  value text not null
);
alter table public.myworld_push_subs enable row level security;
alter table public.myworld_push_sent enable row level security;
alter table public.myworld_config enable row level security;
