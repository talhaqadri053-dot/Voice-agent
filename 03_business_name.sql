insert into public.settings (key, value)
values ('business_name', to_jsonb('Stem & Tafel'::text))
on conflict (key) do nothing;