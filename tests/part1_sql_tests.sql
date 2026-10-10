-- Run supabase_schema.sql, 02_migration_admin_spec.sql, then n8n_supabase_functions.sql first.
-- 02_migration_admin_spec.sql is currently absent from this workspace; do not recreate it from this test file.
-- Run the fixture once, then run each DO block separately in order. All fixture inserts are repeatable.

-- Repeatable fixture from the Part 1 test plan.
insert into public.menu_modifier_groups (id, name, required, min_select, max_select)
values ('a12b1006-0000-4000-8000-000000000101', 'Part 1 test extra', false, 0, 1)
on conflict (id) do update set name = excluded.name, required = excluded.required, min_select = excluded.min_select, max_select = excluded.max_select;

insert into public.menu_modifier_options (id, group_id, name, extra_price)
values ('a12b1006-0000-4000-8000-000000000102', 'a12b1006-0000-4000-8000-000000000101', 'Extra test', 1.00)
on conflict (id) do update set group_id = excluded.group_id, name = excluded.name, extra_price = excluded.extra_price;

insert into public.menu_item_modifier_groups (menu_item_id, modifier_group_id)
select id, 'a12b1006-0000-4000-8000-000000000101'
from public.menu_items
where name = 'Stroopwafel'
on conflict (menu_item_id, modifier_group_id) do nothing;

insert into public.delivery_zones (id, name, postcodes, fee, minimum_order)
values ('a12b1006-0000-4000-8000-000000000103', 'Part 1 test zone', array['1011'], 2.50, 5.00)
on conflict (id) do update set name = excluded.name, postcodes = excluded.postcodes, fee = excluded.fee, minimum_order = excluded.minimum_order;

insert into public.promotions (id, name, promo_type, discount_value, free_item, promo_code, minimum_order, starts_at, ends_at, days_of_week, is_active)
values
    ('a12b1006-0000-4000-8000-000000000104', 'Part 1 test korting', 'percentage', 10, null, 'PART1', 0, now() - interval '1 day', now() + interval '1 day', array[1,2,3,4,5,6,7]::smallint[], true),
    ('a12b1006-0000-4000-8000-000000000106', 'Part 1 not started', 'percentage', 10, null, 'FUTUREPART1', 0, now() + interval '1 day', now() + interval '2 days', array[1,2,3,4,5,6,7]::smallint[], true),
    ('a12b1006-0000-4000-8000-000000000107', 'Part 1 expired', 'percentage', 10, null, 'EXPIREDPART1', 0, now() - interval '2 days', now() - interval '1 day', array[1,2,3,4,5,6,7]::smallint[], true),
    ('a12b1006-0000-4000-8000-000000000108', 'Part 1 wrong weekday', 'percentage', 10, null, 'DAYPART1', 0, now() - interval '1 day', now() + interval '1 day', array[(((extract(isodow from (now() at time zone 'Europe/Amsterdam'))::integer % 7) + 1)::smallint], true),
    ('a12b1006-0000-4000-8000-000000000109', 'Part 1 inactive', 'percentage', 10, null, 'INACTIVEPART1', 0, now() - interval '1 day', now() + interval '1 day', array[1,2,3,4,5,6,7]::smallint[], false),
    ('a12b1006-0000-4000-8000-000000000111', 'Part 1 free item', 'free_item', null, 'Stroopwafel', 'FREEPART1', 0, now() - interval '1 day', now() + interval '1 day', array[1,2,3,4,5,6,7]::smallint[], true),
    ('a12b1006-0000-4000-8000-000000000112', 'Part 1 flat amount', 'flat_amount', 1.50, null, 'FLATPART1', 0, now() - interval '1 day', now() + interval '1 day', array[1,2,3,4,5,6,7]::smallint[], true)
on conflict (id) do update set name = excluded.name, promo_type = excluded.promo_type, discount_value = excluded.discount_value, free_item = excluded.free_item, promo_code = excluded.promo_code, minimum_order = excluded.minimum_order, starts_at = excluded.starts_at, ends_at = excluded.ends_at, days_of_week = excluded.days_of_week, is_active = excluded.is_active;

insert into public.calls (id, vapi_call_id, phone)
values
    ('a12b1006-0000-4000-8000-000000000105', 'part1-test-create-order', '+31600000000'),
    ('a12b1006-0000-4000-8000-000000000110', 'part1-test-idempotency', '+31600000000')
on conflict (id) do update set vapi_call_id = excluded.vapi_call_id, phone = excluded.phone;

-- TEST 1 EXPECTED: ok=true, subtotal=7.00, discount_amount=0.70, delivery_fee=2.50, total=8.80.
do $$
declare
    result jsonb;
begin
    result := public.voice_calculate_order(
        '[{"name":"Stroopwafel","quantity":2,"modifiers":[{"option_id":"a12b1006-0000-4000-8000-000000000102"}]}]'::jsonb,
        'delivery', 'Damrak 1, 1011 AB Amsterdam', 'PART1'
    );
    if result->>'ok' is distinct from 'true'
       or (result->>'subtotal')::numeric <> 7.00
       or (result->>'discount_amount')::numeric <> 0.70
       or (result->>'delivery_fee')::numeric <> 2.50
       or (result->>'total')::numeric <> 8.80 then
        raise exception 'TEST 1 failed: %', result;
    end if;
    raise notice 'TEST 1 passed: %', result;
end;
$$;

-- TEST 2 EXPECTED: pickup succeeds without an address and delivery_fee=0.
do $$
declare
    result jsonb;
begin
    result := public.voice_calculate_order('[{"name":"Stroopwafel","quantity":2}]'::jsonb, 'pickup', null, null);
    if result->>'ok' is distinct from 'true' or (result->>'delivery_fee')::numeric <> 0 then
        raise exception 'TEST 2 failed: %', result;
    end if;
    raise notice 'TEST 2 passed: %', result;
end;
$$;

-- TEST 3 EXPECTED: wrong promo code returns ok=false, zero/no discount, a clear Dutch message, and no SQL exception.
do $$
declare
    result jsonb;
begin
    result := public.voice_calculate_order('[{"name":"Stroopwafel","quantity":2}]'::jsonb, 'pickup', null, 'WRONGPART1');
    if result->>'ok' is distinct from 'false'
       or coalesce((result->>'discount_amount')::numeric, 0) <> 0
       or result->>'message' <> 'Deze actiecode is vandaag niet geldig.' then
        raise exception 'TEST 3 failed: %', result;
    end if;
    raise notice 'TEST 3 passed: %', result;
end;
$$;

-- TEST 4 EXPECTED: delivery below the zone minimum returns the Dutch minimum-order message.
do $$
declare
    result jsonb;
begin
    result := public.voice_calculate_order(
        '[{"name":"Stroopwafel","quantity":1,"modifiers":[{"option_id":"a12b1006-0000-4000-8000-000000000102"}]}]'::jsonb,
        'delivery', 'Damrak 1, 1011 AB Amsterdam', null
    );
    if result->>'ok' is distinct from 'false' or result->>'message' not like '%minimum bestelling%' then
        raise exception 'TEST 4 failed: %', result;
    end if;
    raise notice 'TEST 4 passed: %', result;
end;
$$;

-- TEST 5 EXPECTED: an unrecognisable postcode prompts the caller to provide it; calculation creates no order.
do $$
declare
    result jsonb;
    before_count bigint;
    after_count bigint;
begin
    select count(*) into before_count from public.orders where customer_phone = '+31600000000';
    result := public.voice_calculate_order('[{"name":"Stroopwafel","quantity":2}]'::jsonb, 'delivery', 'Damrak 1 Amsterdam', null);
    select count(*) into after_count from public.orders where customer_phone = '+31600000000';
    if result->>'ok' is distinct from 'false'
       or result->>'message' not like '%Wat is de postcode%'
       or before_count <> after_count then
        raise exception 'TEST 5 failed: %, orders before %, after %', result, before_count, after_count;
    end if;
    raise notice 'TEST 5 passed: %', result;
end;
$$;

-- TEST 6 EXPECTED: invalid option_id is rejected and returns no recalculated price or total.
do $$
declare
    valid_result jsonb;
    invalid_result jsonb;
begin
    valid_result := public.voice_calculate_order('[{"name":"Stroopwafel","quantity":2}]'::jsonb, 'pickup', null, null);
    invalid_result := public.voice_calculate_order(
        '[{"name":"Stroopwafel","quantity":2,"modifiers":[{"option_id":"00000000-0000-0000-0000-000000000000"}]}]'::jsonb,
        'pickup', null, null
    );
    if valid_result->>'ok' is distinct from 'true'
       or (valid_result->>'subtotal')::numeric <> 5.00
       or invalid_result->>'ok' is distinct from 'false'
       or invalid_result->>'message' not like '%aanpassing%'
       or invalid_result ? 'total' then
        raise exception 'TEST 6 failed: valid %, invalid %', valid_result, invalid_result;
    end if;
    raise notice 'TEST 6 passed: valid %, invalid %', valid_result, invalid_result;
end;
$$;

-- TEST 7 EXPECTED: unavailable menu item is rejected with a Dutch unavailable-item message; original stock value is restored.
do $$
declare
    result jsonb;
    was_available boolean;
begin
    select available into was_available from public.menu_items where name = 'Stroopwafel';
    update public.menu_items set available = false where name = 'Stroopwafel';
    result := public.voice_calculate_order('[{"name":"Stroopwafel","quantity":1}]'::jsonb, 'pickup', null, null);
    update public.menu_items set available = was_available where name = 'Stroopwafel';
    if result->>'ok' is distinct from 'false' or result->>'message' not like '%niet beschikbaar%' then
        raise exception 'TEST 7 failed: %', result;
    end if;
    raise notice 'TEST 7 passed: %', result;
end;
$$;

-- TEST 8A EXPECTED: a future promotion is not applied; the Dutch invalid-code response is returned.
do $$
declare result jsonb;
begin
    result := public.voice_calculate_order('[{"name":"Stroopwafel","quantity":2}]'::jsonb, 'pickup', null, 'FUTUREPART1');
    if result->>'ok' is distinct from 'false' or result->>'message' <> 'Deze actiecode is vandaag niet geldig.' then raise exception 'TEST 8A failed: %', result; end if;
    raise notice 'TEST 8A passed: %', result;
end;
$$;

-- TEST 8B EXPECTED: an expired promotion is not applied.
do $$
declare result jsonb;
begin
    result := public.voice_calculate_order('[{"name":"Stroopwafel","quantity":2}]'::jsonb, 'pickup', null, 'EXPIREDPART1');
    if result->>'ok' is distinct from 'false' or result->>'message' <> 'Deze actiecode is vandaag niet geldig.' then raise exception 'TEST 8B failed: %', result; end if;
    raise notice 'TEST 8B passed: %', result;
end;
$$;

-- TEST 8C EXPECTED: a promotion restricted to another ISO weekday is not applied.
do $$
declare result jsonb;
begin
    result := public.voice_calculate_order('[{"name":"Stroopwafel","quantity":2}]'::jsonb, 'pickup', null, 'DAYPART1');
    if result->>'ok' is distinct from 'false' or result->>'message' <> 'Deze actiecode is vandaag niet geldig.' then raise exception 'TEST 8C failed: %', result; end if;
    raise notice 'TEST 8C passed: %', result;
end;
$$;

-- TEST 8D EXPECTED: an inactive promotion is not applied.
do $$
declare result jsonb;
begin
    result := public.voice_calculate_order('[{"name":"Stroopwafel","quantity":2}]'::jsonb, 'pickup', null, 'INACTIVEPART1');
    if result->>'ok' is distinct from 'false' or result->>'message' <> 'Deze actiecode is vandaag niet geldig.' then raise exception 'TEST 8D failed: %', result; end if;
    raise notice 'TEST 8D passed: %', result;
end;
$$;

-- TEST 9A EXPECTED: free_item discounts one Stroopwafel, including its selected extra; subtotal=7.00, discount=3.50, total=3.50.
do $$
declare result jsonb;
begin
    result := public.voice_calculate_order(
        '[{"name":"Stroopwafel","quantity":2,"modifiers":[{"option_id":"a12b1006-0000-4000-8000-000000000102"}]}]'::jsonb,
        'pickup', null, 'FREEPART1'
    );
    if result->>'ok' is distinct from 'true' or (result->>'subtotal')::numeric <> 7.00 or (result->>'discount_amount')::numeric <> 3.50 or (result->>'total')::numeric <> 3.50 then raise exception 'TEST 9A failed: %', result; end if;
    raise notice 'TEST 9A passed: %', result;
end;
$$;

-- TEST 9B EXPECTED: flat_amount discounts EUR 1.50; subtotal=7.00, discount=1.50, total=5.50.
do $$
declare result jsonb;
begin
    result := public.voice_calculate_order(
        '[{"name":"Stroopwafel","quantity":2,"modifiers":[{"option_id":"a12b1006-0000-4000-8000-000000000102"}]}]'::jsonb,
        'pickup', null, 'FLATPART1'
    );
    if result->>'ok' is distinct from 'true' or (result->>'subtotal')::numeric <> 7.00 or (result->>'discount_amount')::numeric <> 1.50 or (result->>'total')::numeric <> 5.50 then raise exception 'TEST 9B failed: %', result; end if;
    raise notice 'TEST 9B passed: %', result;
end;
$$;

-- TEST 10 EXPECTED: one pending order is saved for +31600000000 with subtotal=7.00, discount=0.70, line_total=7.00, and the normalized modifier.
do $$
declare
    result jsonb;
    saved_order public.orders%rowtype;
    saved_item public.order_items%rowtype;
begin
    result := public.voice_create_order(
        '+31600000000', 'pickup', null,
        '[{"name":"Stroopwafel","quantity":2,"modifiers":[{"option_id":"a12b1006-0000-4000-8000-000000000102"}]}'::jsonb,
        'a12b1006-0000-4000-8000-000000000105'::uuid, 'PART1'
    );
    if result->>'ok' is distinct from 'true' or result->>'status' <> 'pending' then raise exception 'TEST 10 create failed: %', result; end if;
    select * into saved_order from public.orders where id = (result->>'order_id')::uuid;
    select * into saved_item from public.order_items where order_id = saved_order.id;
    if saved_order.customer_phone <> '+31600000000'
       or saved_order.status <> 'pending'
       or saved_order.subtotal <> 7.00
       or saved_order.discount_amount <> 0.70
       or saved_order.total <> 6.30
       or saved_item.line_total <> 7.00
       or not (saved_item.modifiers @> '[{"option_id":"a12b1006-0000-4000-8000-000000000102"}]'::jsonb) then
        raise exception 'TEST 10 persistence failed: result %, order %, item %', result, row_to_json(saved_order), row_to_json(saved_item);
    end if;
    raise notice 'TEST 10 passed: %', result;
end;
$$;

-- TEST 11 EXPECTED: two calls with the same call_id return the same order id; exactly one order exists for that call_id.
do $$
declare
    first_result jsonb;
    second_result jsonb;
    order_count bigint;
begin
    first_result := public.voice_create_order(
        '+31600000000', 'pickup', null,
        '[{"name":"Stroopwafel","quantity":2,"modifiers":[{"option_id":"a12b1006-0000-4000-8000-000000000102"}]}'::jsonb,
        'a12b1006-0000-4000-8000-000000000110'::uuid, 'PART1'
    );
    second_result := public.voice_create_order(
        '+31600000000', 'pickup', null,
        '[{"name":"Stroopwafel","quantity":2,"modifiers":[{"option_id":"a12b1006-0000-4000-8000-000000000102"}]}'::jsonb,
        'a12b1006-0000-4000-8000-000000000110'::uuid, 'PART1'
    );
    select count(*) into order_count from public.orders where call_id = 'a12b1006-0000-4000-8000-000000000110'::uuid;
    if first_result->>'ok' is distinct from 'true'
       or second_result->>'ok' is distinct from 'true'
       or first_result->>'order_id' <> second_result->>'order_id'
       or order_count <> 1 then
        raise exception 'TEST 11 failed: first %, second %, count %', first_result, second_result, order_count;
    end if;
    raise notice 'TEST 11 passed: first %, second %, count %', first_result, second_result, order_count;
end;
$$;

-- Final cleanup: only the test phone's orders and rows with the Part 1 fixture UUIDs are deleted.
delete from public.orders where customer_phone = '+31600000000';
delete from public.calls where id in (
    'a12b1006-0000-4000-8000-000000000105'::uuid,
    'a12b1006-0000-4000-8000-000000000110'::uuid
);
delete from public.menu_item_modifier_groups where modifier_group_id = 'a12b1006-0000-4000-8000-000000000101'::uuid;
delete from public.menu_modifier_options where id = 'a12b1006-0000-4000-8000-000000000102'::uuid;
delete from public.menu_modifier_groups where id = 'a12b1006-0000-4000-8000-000000000101'::uuid;
delete from public.delivery_zones where id = 'a12b1006-0000-4000-8000-000000000103'::uuid;
delete from public.promotions where id in (
    'a12b1006-0000-4000-8000-000000000104'::uuid,
    'a12b1006-0000-4000-8000-000000000106'::uuid,
    'a12b1006-0000-4000-8000-000000000107'::uuid,
    'a12b1006-0000-4000-8000-000000000108'::uuid,
    'a12b1006-0000-4000-8000-000000000109'::uuid,
    'a12b1006-0000-4000-8000-000000000111'::uuid,
    'a12b1006-0000-4000-8000-000000000112'::uuid
);