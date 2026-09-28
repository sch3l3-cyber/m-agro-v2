-- NDVI cache pamti i "negativne" ishode, da se za oblačan dan ili dan bez snimke
-- ne troši Sentinel kvota svaki put kad netko otvori česticu (07_FREE_TIER_STRATEGY.md).
alter table public.ndvi_cache
  add column status text not null default 'ok' check (status in ('ok', 'oblacno', 'nema_snimke'));

comment on column public.ndvi_cache.cloud_pct is '% piksela čestice pokriven oblakom/sjenom (SCL 3,8,9,10)';
comment on column public.ndvi_cache.sample_count is 'broj čistih piksela korištenih u statistici';
