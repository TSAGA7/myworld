-- MY WORLD: the feed collector runs every hour for real. GitHub's own schedule is late by hours, so pg_cron asks
-- supabase/functions/feed-kick to start .github/workflows/feed.yml at :25 every hour. Needs myworld_config.gh_dispatch_token.
create extension if not exists pg_cron;
create extension if not exists pg_net;
insert into public.myworld_config (key, value)
values ('kick_key', encode(gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;
select cron.unschedule('myworld-feed-kick') where exists (select 1 from cron.job where jobname = 'myworld-feed-kick');
select cron.schedule(
  'myworld-feed-kick',
  '25 * * * *',
  $$
  select net.http_post(
    url := 'https://gpnpqwyniqmdinwazegh.supabase.co/functions/v1/feed-kick',
    headers := '{"content-type":"application/json"}'::jsonb,
    body := jsonb_build_object('reason', 'cron', 'key', (select value from public.myworld_config where key = 'kick_key'))
  );
  $$
);
