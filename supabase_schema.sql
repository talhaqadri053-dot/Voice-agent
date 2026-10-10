-- SQL execution order: supabase_schema.sql -> 02_migration_admin_spec.sql -> n8n_supabase_functions.sql.
-- Supabase schema for a Dutch voice-AI ordering and booking system.
-- Authenticated users are treated as admins by the policies below.
-- n8n should connect server-side with the Supabase service_role key; never expose it in a client.

create extension if not exists pgcrypto;

create table if not exists public.menu_items (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    description text not null default '',
    price numeric(10, 2) not null check (price >= 0),
    category text not null,
    available boolean not null default true,
    prep_minutes integer not null default 0 check (prep_minutes >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.menu_modifier_groups (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    required boolean not null default false,
    min_select integer not null default 0 check (min_select >= 0),
    max_select integer not null default 1 check (max_select >= 1),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.menu_modifier_options (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.menu_modifier_groups(id) on delete cascade,
    name text not null,
    extra_price numeric(10, 2) not null default 0 check (extra_price >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.menu_item_modifier_groups (
    id uuid primary key default gen_random_uuid(),
    menu_item_id uuid not null references public.menu_items(id) on delete cascade,
    modifier_group_id uuid not null references public.menu_modifier_groups(id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (menu_item_id, modifier_group_id)
);

create table if not exists public.delivery_zones (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    postcodes text[] not null default '{}',
    fee numeric(10, 2) not null default 0 check (fee >= 0),
    minimum_order numeric(10, 2) not null default 0 check (minimum_order >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.delivery_zones add column if not exists active boolean not null default true;

create table if not exists public.promotions (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    promo_type text not null check (promo_type in ('percentage', 'flat_amount', 'free_item')),
    discount_value numeric(10, 2),
    free_item text,
    promo_code text,
    minimum_order numeric(10, 2) not null default 0 check (minimum_order >= 0),
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    days_of_week smallint[] not null default array[1,2,3,4,5,6,7]::smallint[],
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (ends_at > starts_at),
    check (promo_type <> 'percentage' or (discount_value > 0 and discount_value <= 100)),
    check (promo_type <> 'flat_amount' or discount_value > 0),
    check (promo_type <> 'free_item' or nullif(trim(free_item), '') is not null)
);

create table if not exists public.calls (
    id uuid primary key default gen_random_uuid(),
    vapi_call_id text unique,
    phone text,
    transcript text not null default '',
    transcript_messages jsonb not null default '[]'::jsonb,
    recording_url text,
    turn_metrics jsonb not null default '[]'::jsonb,
    summary text not null default '',
    duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
    sms_status text not null default 'not_sent',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.calls add column if not exists transcript_messages jsonb not null default '[]'::jsonb;
alter table public.calls add column if not exists recording_url text;
alter table public.calls add column if not exists turn_metrics jsonb not null default '[]'::jsonb;

create table if not exists public.orders (
    id uuid primary key default gen_random_uuid(),
    customer_phone text not null,
    order_type text not null check (order_type in ('pickup', 'delivery')),
    delivery_address text,
    subtotal numeric(10, 2) not null default 0 check (subtotal >= 0),
    discount_amount numeric(10, 2) not null default 0 check (discount_amount >= 0),
    promotion_id uuid references public.promotions(id) on delete set null,
    promo_code text,
    total numeric(10, 2) not null default 0 check (total >= 0),
    delivery_fee numeric(10, 2) not null default 0 check (delivery_fee >= 0),
    status text not null default 'pending'
        check (status in ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled')),
    eta_minutes integer check (eta_minutes is null or eta_minutes >= 0),
    call_id uuid references public.calls(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (order_type <> 'delivery' or delivery_address is not null)
);

alter table public.orders add column if not exists subtotal numeric(10, 2) not null default 0 check (subtotal >= 0);
alter table public.orders add column if not exists discount_amount numeric(10, 2) not null default 0 check (discount_amount >= 0);
alter table public.orders add column if not exists promotion_id uuid references public.promotions(id) on delete set null;
alter table public.orders add column if not exists promo_code text;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
    check (status in ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'completed', 'cancelled'));

create table if not exists public.order_items (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    menu_item_id uuid references public.menu_items(id) on delete set null,
    item_name text not null,
    quantity integer not null check (quantity > 0),
    unit_price numeric(10, 2) not null check (unit_price >= 0),
    notes text not null default '',
    modifiers jsonb not null default '[]'::jsonb,
    line_total numeric(10, 2) not null default 0 check (line_total >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.order_items add column if not exists modifiers jsonb not null default '[]'::jsonb;
alter table public.order_items add column if not exists line_total numeric(10, 2) not null default 0 check (line_total >= 0);

create table if not exists public.bookings (
    id uuid primary key default gen_random_uuid(),
    call_id uuid references public.calls(id) on delete set null,
    customer_phone text not null,
    customer_name text not null,
    service text not null,
    date date not null,
    time time not null,
    people_count integer not null default 1 check (people_count > 0),
    status text not null default 'confirmed'
        check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.bookings
    add column if not exists call_id uuid references public.calls(id) on delete set null;

create table if not exists public.settings (
    key text primary key,
    value jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists menu_items_category_available_idx
    on public.menu_items (category, available);
create index if not exists orders_created_at_idx
    on public.orders (created_at desc);
create index if not exists orders_status_created_at_idx
    on public.orders (status, created_at desc);
create index if not exists orders_customer_phone_idx
    on public.orders (customer_phone);
create index if not exists orders_call_id_idx
    on public.orders (call_id);
create index if not exists order_items_order_id_idx
    on public.order_items (order_id);
create index if not exists order_items_menu_item_id_idx
    on public.order_items (menu_item_id);
create index if not exists bookings_date_time_idx
    on public.bookings (date, time);
create index if not exists bookings_customer_phone_idx
    on public.bookings (customer_phone);
create index if not exists bookings_call_id_idx
    on public.bookings (call_id);
create index if not exists calls_created_at_idx
    on public.calls (created_at desc);
create index if not exists calls_phone_idx
    on public.calls (phone);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_menu_items_updated_at on public.menu_items;
create trigger set_menu_items_updated_at before update on public.menu_items
    for each row execute function public.set_updated_at();
drop trigger if exists set_menu_modifier_groups_updated_at on public.menu_modifier_groups;
create trigger set_menu_modifier_groups_updated_at before update on public.menu_modifier_groups
    for each row execute function public.set_updated_at();
drop trigger if exists set_menu_modifier_options_updated_at on public.menu_modifier_options;
create trigger set_menu_modifier_options_updated_at before update on public.menu_modifier_options
    for each row execute function public.set_updated_at();
drop trigger if exists set_menu_item_modifier_groups_updated_at on public.menu_item_modifier_groups;
create trigger set_menu_item_modifier_groups_updated_at before update on public.menu_item_modifier_groups
    for each row execute function public.set_updated_at();
drop trigger if exists set_delivery_zones_updated_at on public.delivery_zones;
create trigger set_delivery_zones_updated_at before update on public.delivery_zones
    for each row execute function public.set_updated_at();
drop trigger if exists set_promotions_updated_at on public.promotions;
create trigger set_promotions_updated_at before update on public.promotions
    for each row execute function public.set_updated_at();
drop trigger if exists set_calls_updated_at on public.calls;
create trigger set_calls_updated_at before update on public.calls
    for each row execute function public.set_updated_at();
drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at before update on public.orders
    for each row execute function public.set_updated_at();
drop trigger if exists set_order_items_updated_at on public.order_items;
create trigger set_order_items_updated_at before update on public.order_items
    for each row execute function public.set_updated_at();
drop trigger if exists set_bookings_updated_at on public.bookings;
create trigger set_bookings_updated_at before update on public.bookings
    for each row execute function public.set_updated_at();
drop trigger if exists set_settings_updated_at on public.settings;
create trigger set_settings_updated_at before update on public.settings
    for each row execute function public.set_updated_at();

alter table public.menu_items enable row level security;
alter table public.menu_modifier_groups enable row level security;
alter table public.menu_modifier_options enable row level security;
alter table public.menu_item_modifier_groups enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.promotions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.bookings enable row level security;
alter table public.calls enable row level security;
alter table public.settings enable row level security;

drop policy if exists "Admins can manage menu_items" on public.menu_items;
create policy "Admins can manage menu_items" on public.menu_items
    for all to authenticated using (true) with check (true);
drop policy if exists "Admins can manage menu_modifier_groups" on public.menu_modifier_groups;
create policy "Admins can manage menu_modifier_groups" on public.menu_modifier_groups
    for all to authenticated using (true) with check (true);
drop policy if exists "Admins can manage menu_modifier_options" on public.menu_modifier_options;
create policy "Admins can manage menu_modifier_options" on public.menu_modifier_options
    for all to authenticated using (true) with check (true);
drop policy if exists "Admins can manage menu_item_modifier_groups" on public.menu_item_modifier_groups;
create policy "Admins can manage menu_item_modifier_groups" on public.menu_item_modifier_groups
    for all to authenticated using (true) with check (true);
drop policy if exists "Admins can manage delivery_zones" on public.delivery_zones;
create policy "Admins can manage delivery_zones" on public.delivery_zones
    for all to authenticated using (true) with check (true);
drop policy if exists "Admins can manage promotions" on public.promotions;
create policy "Admins can manage promotions" on public.promotions
    for all to authenticated using (true) with check (true);
drop policy if exists "Admins can manage orders" on public.orders;
create policy "Admins can manage orders" on public.orders
    for all to authenticated using (true) with check (true);
drop policy if exists "Admins can manage order_items" on public.order_items;
create policy "Admins can manage order_items" on public.order_items
    for all to authenticated using (true) with check (true);
drop policy if exists "Admins can manage bookings" on public.bookings;
create policy "Admins can manage bookings" on public.bookings
    for all to authenticated using (true) with check (true);
drop policy if exists "Admins can manage calls" on public.calls;
create policy "Admins can manage calls" on public.calls
    for all to authenticated using (true) with check (true);
drop policy if exists "Admins can manage settings" on public.settings;
create policy "Admins can manage settings" on public.settings
    for all to authenticated using (true) with check (true);

-- Add the requested tables to Supabase Realtime without failing on a rerun.
do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
                    and tablename = 'menu_items'
        ) then
                alter publication supabase_realtime add table public.menu_items;
        end if;
        if not exists (
                select 1
                from pg_publication_tables
                where pubname = 'supabase_realtime'
                    and schemaname = 'public'
          and tablename = 'orders'
    ) then
        alter publication supabase_realtime add table public.orders;
    end if;
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'bookings'
    ) then
        alter publication supabase_realtime add table public.bookings;
    end if;
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'calls'
    ) then
        alter publication supabase_realtime add table public.calls;
    end if;
end;
$$;

insert into public.menu_items (name, description, price, category, prep_minutes) values
    ('Stroopwafel', 'Warme Nederlandse stroopwafel', 2.50, 'Zoet', 5),
    ('Appeltaart', 'Huisgemaakte appeltaart met slagroom', 4.25, 'Zoet', 5),
    ('Poffertjes', 'Twaalf poffertjes met boter en poedersuiker', 6.50, 'Zoet', 10),
    ('Pannenkoek naturel', 'Dunne pannenkoek met stroop of poedersuiker', 8.50, 'Pannenkoeken', 12),
    ('Pannenkoek spek en kaas', 'Pannenkoek met spek en jonge kaas', 12.50, 'Pannenkoeken', 15),
    ('Tosti ham-kaas', 'Geroosterd brood met ham en jonge kaas', 6.75, 'Lunch', 10),
    ('Uitsmijter', 'Drie eieren met ham en kaas op boerenbrood', 11.50, 'Lunch', 15),
    ('Broodje kroket', 'Twee rundvleeskroketten met mosterd op wit brood', 8.95, 'Lunch', 12),
    ('Erwtensoep', 'Hollandse snert met roggebrood en katenspek', 8.50, 'Soep', 20),
    ('Bitterballen', 'Acht rundvleesbitterballen met mosterd', 7.95, 'Borrel', 10),
    ('Kaassouffle', 'Twee krokante kaassouffles met chilisaus', 5.95, 'Snacks', 8),
    ('Friet met mayonaise', 'Verse friet met romige mayonaise', 4.50, 'Snacks', 8),
    ('Kipsaté', 'Kipsaté met pindasaus, kroepoek en friet', 16.95, 'Hoofdgerechten', 20),
    ('Hollandse burger', 'Rundvleesburger met oude kaas, sla en friet', 17.50, 'Hoofdgerechten', 20),
    ('Tomatensoep', 'Romige tomatensoep met basilicum en brood', 7.25, 'Soep', 12)
on conflict (name) do nothing;

insert into public.settings (key, value) values
    ('opening_hours', '{"maandag":"gesloten","dinsdag":"10:00-22:00","woensdag":"10:00-22:00","donderdag":"10:00-22:00","vrijdag":"10:00-23:00","zaterdag":"10:00-23:00","zondag":"11:00-21:00"}'::jsonb),
    ('base_prep_minutes', '20'::jsonb),
    ('delivery_fee_eur', '3.50'::jsonb),
    ('sms_template_nl', to_jsonb('Bedankt voor uw bestelling! We bereiden deze nu en verwachten u over ongeveer {{eta_minutes}} minuten. Tot snel!'::text))
on conflict (key) do nothing;