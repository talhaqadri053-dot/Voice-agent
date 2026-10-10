-- SQL execution order: supabase_schema.sql -> 02_migration_admin_spec.sql -> n8n_supabase_functions.sql.
-- These RPCs keep pricing and writes server-side
-- and let each n8n tool complete with a single Supabase request.

create or replace function public.voice_calculate_order(
    p_items jsonb,
    p_order_type text,
    p_delivery_address text,
    p_promo_code text
)
returns jsonb
language plpgsql
stable
as $$
declare
    v_item jsonb;
    v_menu_item public.menu_items%rowtype;
    v_quantity integer;
    v_subtotal numeric(10, 2) := 0;
    v_delivery_fee numeric(10, 2) := 0;
    v_zone_minimum numeric(10, 2) := 0;
    v_discount numeric(10, 2) := 0;
    v_total numeric(10, 2) := 0;
    v_candidate_discount numeric(10, 2) := 0;
    v_base_prep integer := 0;
    v_max_item_prep integer := 0;
    v_lines jsonb := '[]'::jsonb;
    v_modifiers jsonb;
    v_item_key text;
    v_item_name text;
    v_modifier jsonb;
    v_modifier_key text;
    v_modifier_name text;
    v_group_key text;
    v_modifier_total numeric(10, 2);
    v_line_total numeric(10, 2);
    v_modifier_row record;
    v_group record;
    v_promotion record;
    v_promotion_id uuid;
    v_promotion_name text;
    v_promo_code text;
    v_promo_found boolean := false;
    v_postcode_match text[];
    v_postcode text;
    v_zone_name text;
    v_zone record;
    v_eta integer;
    v_day smallint;
begin
    if p_order_type is null or p_order_type not in ('pickup', 'delivery') then
        return jsonb_build_object('ok', false, 'message', 'Kies afhalen of bezorgen.');
    end if;
    if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
        return jsonb_build_object('ok', false, 'message', 'Voeg minstens één artikel aan uw bestelling toe.');
    end if;
    if jsonb_array_length(p_items) = 0 then
        return jsonb_build_object('ok', false, 'message', 'Voeg minstens één artikel aan uw bestelling toe.');
    end if;

    for v_item in select value from jsonb_array_elements(p_items)
    loop
        if coalesce(v_item->>'quantity', '') !~ '^[1-9][0-9]*$' then
            return jsonb_build_object('ok', false, 'message', 'Een aantal in de bestelling is ongeldig.');
        end if;
        v_quantity := (v_item->>'quantity')::integer;
        v_item_key := coalesce(v_item->>'menu_item_id', v_item->>'item_id', v_item->>'id');
        v_item_name := coalesce(v_item->>'name', v_item->>'item_name');
        if v_item ? 'modifiers' and jsonb_typeof(v_item->'modifiers') is distinct from 'array' then
            return jsonb_build_object('ok', false, 'message', 'De gekozen aanpassingen zijn ongeldig.');
        end if;

        select * into v_menu_item
        from public.menu_items
        where available
          and ((v_item_key is not null and id::text = v_item_key)
               or (v_item_name is not null and lower(name) = lower(v_item_name)))
        limit 1;

        if not found then
            return jsonb_build_object(
                'ok', false,
                'message', format('Sorry, %s is niet beschikbaar.', coalesce(v_item_name, 'dit artikel'))
            );
        end if;

        v_modifiers := '[]'::jsonb;
        v_modifier_total := 0;
        for v_modifier in select value from jsonb_array_elements(coalesce(v_item->'modifiers', '[]'::jsonb))
        loop
            v_modifier_key := coalesce(v_modifier->>'option_id', v_modifier->>'id');
            v_modifier_name := coalesce(v_modifier->>'name', v_modifier->>'option_name');
            v_group_key := v_modifier->>'group_id';

            select modifier_group.id as group_id,
                   modifier_group.name as group_name,
                   option_row.id as option_id,
                   option_row.name as option_name,
                   option_row.extra_price
            into v_modifier_row
            from public.menu_item_modifier_groups item_group
            join public.menu_modifier_groups modifier_group on modifier_group.id = item_group.modifier_group_id
            join public.menu_modifier_options option_row on option_row.group_id = modifier_group.id
            where item_group.menu_item_id = v_menu_item.id
              and ((v_modifier_key is not null and option_row.id::text = v_modifier_key)
                   or (v_modifier_name is not null and lower(option_row.name) = lower(v_modifier_name)))
              and (v_group_key is null or modifier_group.id::text = v_group_key or lower(modifier_group.name) = lower(v_group_key))
            limit 1;

            if not found then
                return jsonb_build_object('ok', false, 'message', format('De gekozen aanpassing voor %s is niet beschikbaar.', v_menu_item.name));
            end if;
            if exists (
                select 1
                from jsonb_array_elements(v_modifiers) selected(value)
                where selected.value->>'option_id' = v_modifier_row.option_id::text
            ) then
                return jsonb_build_object('ok', false, 'message', 'Een aanpassing is dubbel gekozen.');
            end if;

            v_modifier_total := v_modifier_total + v_modifier_row.extra_price;
            v_modifiers := v_modifiers || jsonb_build_array(jsonb_build_object(
                'group_id', v_modifier_row.group_id,
                'group_name', v_modifier_row.group_name,
                'option_id', v_modifier_row.option_id,
                'name', v_modifier_row.option_name,
                'extra_price', v_modifier_row.extra_price
            ));
        end loop;

        for v_group in
            select modifier_group.id,
                   modifier_group.name,
                   modifier_group.required,
                   modifier_group.min_select,
                   modifier_group.max_select,
                   count(selected.value)::integer as selected_count
            from public.menu_item_modifier_groups item_group
            join public.menu_modifier_groups modifier_group on modifier_group.id = item_group.modifier_group_id
            left join lateral jsonb_array_elements(v_modifiers) selected(value)
                on selected.value->>'group_id' = modifier_group.id::text
            where item_group.menu_item_id = v_menu_item.id
            group by modifier_group.id
        loop
            if v_group.selected_count > v_group.max_select then
                return jsonb_build_object('ok', false, 'message', format('Kies maximaal %s aanpassingen voor %s.', v_group.max_select, v_group.name));
            end if;
            if v_group.selected_count < greatest(v_group.min_select, case when v_group.required then 1 else 0 end) then
                return jsonb_build_object('ok', false, 'message', format('Kies nog een verplichte aanpassing voor %s.', v_menu_item.name));
            end if;
        end loop;

        v_line_total := round((v_menu_item.price + v_modifier_total) * v_quantity, 2);
        v_subtotal := v_subtotal + v_line_total;
        v_max_item_prep := greatest(v_max_item_prep, v_menu_item.prep_minutes);
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
            'menu_item_id', v_menu_item.id,
            'name', v_menu_item.name,
            'quantity', v_quantity,
            'unit_price', v_menu_item.price,
            'notes', coalesce(v_item->>'notes', ''),
            'modifiers', v_modifiers,
            'line_total', v_line_total
        ));
    end loop;

    v_subtotal := round(v_subtotal, 2);
    if p_order_type = 'delivery' then
        v_postcode_match := regexp_match(upper(coalesce(p_delivery_address, '')), '\m[1-9][0-9]{3}\s?[A-Z]{2}\M');
        if v_postcode_match is null then
            return jsonb_build_object('ok', false, 'message', 'Wat is de postcode van het bezorgadres? Ik kan deze niet uit het adres halen.');
        end if;
        v_postcode := regexp_replace(v_postcode_match[1], '\s+', '', 'g');

        select zone_row.*
        into v_zone
        from public.delivery_zones zone_row
        cross join lateral unnest(zone_row.postcodes) postcode(value)
        where upper(regexp_replace(trim(postcode.value), '\s+', '', 'g')) in (v_postcode, left(v_postcode, 4))
        order by case when upper(regexp_replace(trim(postcode.value), '\s+', '', 'g')) = v_postcode then 0 else 1 end,
                 zone_row.name
        limit 1;
        if not found then
            return jsonb_build_object('ok', false, 'message', 'We bezorgen helaas niet op deze postcode.');
        end if;
        v_delivery_fee := v_zone.fee;
        v_zone_minimum := v_zone.minimum_order;
        v_zone_name := v_zone.name;
        if v_subtotal < v_zone_minimum then
            return jsonb_build_object('ok', false, 'message', format('Voor bezorging in deze zone geldt een minimum bestelling van EUR %s.', replace(to_char(v_zone_minimum, 'FM999999990D00'), '.', ',')));
        end if;
    end if;

    v_day := extract(isodow from (now() at time zone 'Europe/Amsterdam'))::smallint;
    if nullif(trim(p_promo_code), '') is not null then
        select promotion.*
        into v_promotion
        from public.promotions promotion
        where promotion.is_active
          and promotion.starts_at <= now()
          and promotion.ends_at > now()
          and promotion.days_of_week @> array[v_day]
          and lower(promotion.promo_code) = lower(trim(p_promo_code))
        order by promotion.created_at
        limit 1;
        if not found then
            return jsonb_build_object('ok', false, 'message', 'Deze actiecode is vandaag niet geldig.');
        end if;
        if v_subtotal < v_promotion.minimum_order then
            return jsonb_build_object('ok', false, 'message', format('Voor deze actie geldt een minimum bestelling van EUR %s.', replace(to_char(v_promotion.minimum_order, 'FM999999990D00'), '.', ',')));
        end if;

        if v_promotion.promo_type = 'percentage' then
            v_discount := round(v_subtotal * v_promotion.discount_value / 100, 2);
        elsif v_promotion.promo_type = 'flat_amount' then
            v_discount := least(v_subtotal, v_promotion.discount_value);
        else
            select coalesce(max((line.value->>'unit_price')::numeric + coalesce((
                select sum((modifier.value->>'extra_price')::numeric)
                from jsonb_array_elements(line.value->'modifiers') modifier(value)
            ), 0)), 0)
            into v_candidate_discount
            from jsonb_array_elements(v_lines) line(value)
            where lower(line.value->>'name') = lower(v_promotion.free_item)
              and (line.value->>'quantity')::integer > 0;
            if v_candidate_discount = 0 then
                return jsonb_build_object('ok', false, 'message', format('Voeg %s toe om deze actie te gebruiken.', v_promotion.free_item));
            end if;
            v_discount := least(v_subtotal, v_candidate_discount);
        end if;
        v_promotion_id := v_promotion.id;
        v_promotion_name := v_promotion.name;
        v_promo_code := v_promotion.promo_code;
        v_promo_found := true;
    else
        for v_promotion in
            select promotion.*
            from public.promotions promotion
            where promotion.is_active
              and promotion.starts_at <= now()
              and promotion.ends_at > now()
              and promotion.days_of_week @> array[v_day]
              and promotion.promo_code is null
              and promotion.minimum_order <= v_subtotal
            order by promotion.created_at
        loop
            if v_promotion.promo_type = 'percentage' then
                v_candidate_discount := round(v_subtotal * v_promotion.discount_value / 100, 2);
            elsif v_promotion.promo_type = 'flat_amount' then
                v_candidate_discount := least(v_subtotal, v_promotion.discount_value);
            else
                select coalesce(max((line.value->>'unit_price')::numeric + coalesce((
                    select sum((modifier.value->>'extra_price')::numeric)
                    from jsonb_array_elements(line.value->'modifiers') modifier(value)
                ), 0)), 0)
                into v_candidate_discount
                from jsonb_array_elements(v_lines) line(value)
                where lower(line.value->>'name') = lower(v_promotion.free_item)
                  and (line.value->>'quantity')::integer > 0;
            end if;

            if v_candidate_discount > v_discount then
                v_discount := least(v_subtotal, v_candidate_discount);
                v_promotion_id := v_promotion.id;
                v_promotion_name := v_promotion.name;
                v_promo_code := v_promotion.promo_code;
                v_promo_found := true;
            end if;
        end loop;
    end if;

    v_discount := round(v_discount, 2);
    v_total := greatest(0, round(v_subtotal - v_discount + v_delivery_fee, 2));

    select coalesce((value #>> '{}')::integer, 0)
    into v_base_prep
    from public.settings
    where key = 'base_prep_minutes';
    v_base_prep := coalesce(v_base_prep, 0);

    if p_order_type = 'pickup' then
        v_delivery_fee := 0;
    end if;
    v_eta := v_base_prep + v_max_item_prep;

    return jsonb_build_object(
        'ok', true,
        'items', v_lines,
        'subtotal', round(v_subtotal, 2),
        'discount_amount', v_discount,
        'promotion_id', case when v_promo_found then to_jsonb(v_promotion_id) else 'null'::jsonb end,
        'promotion_name', case when v_promo_found then to_jsonb(v_promotion_name) else 'null'::jsonb end,
        'promo_code', case when v_promo_found then to_jsonb(v_promo_code) else 'null'::jsonb end,
        'delivery_fee', round(v_delivery_fee, 2),
        'delivery_zone', case when v_zone_name is not null then to_jsonb(v_zone_name) else 'null'::jsonb end,
        'total', v_total,
        'eta_minutes', v_eta,
        'message', format('Uw bestelling komt op EUR %s uit. Verwachte tijd: circa %s minuten.', replace(to_char(v_total, 'FM999999990D00'), '.', ','), v_eta)
    );
exception
    when others then
        return jsonb_build_object('ok', false, 'message', 'Het berekenen van uw bestelling lukt nu niet. Probeert u het zo opnieuw.');
end;
$$;

create or replace function public.voice_calculate_order(
    p_items jsonb,
    p_order_type text
)
returns jsonb
language sql
stable
as $$
    select public.voice_calculate_order(p_items, p_order_type, null, null);
$$;

create or replace function public.voice_create_order(
    p_customer_phone text,
    p_order_type text,
    p_delivery_address text,
    p_items jsonb,
    p_call_id uuid,
    p_promo_code text
)
returns jsonb
language plpgsql
as $$
declare
    v_calculation jsonb;
    v_order_id uuid;
    v_line jsonb;
    v_existing_order public.orders%rowtype;
begin
    if nullif(trim(p_customer_phone), '') is null then
        return jsonb_build_object('ok', false, 'message', 'Ik heb uw telefoonnummer nodig om de bestelling te plaatsen.');
    end if;
    if p_order_type = 'delivery' and nullif(trim(p_delivery_address), '') is null then
        return jsonb_build_object('ok', false, 'message', 'Wat is het bezorgadres?');
    end if;

    if p_call_id is not null then
        perform pg_advisory_xact_lock(hashtextextended(p_call_id::text, 0));
        select * into v_existing_order
        from public.orders
        where call_id = p_call_id
        order by created_at desc
        limit 1;
        if found then
            return jsonb_build_object(
                'ok', true,
                'duplicate', true,
                'order_id', v_existing_order.id,
                'order_number', upper(left(replace(v_existing_order.id::text, '-', ''), 8)),
                'status', v_existing_order.status,
                'subtotal', v_existing_order.subtotal,
                'discount_amount', v_existing_order.discount_amount,
                'promotion_id', v_existing_order.promotion_id,
                'promo_code', v_existing_order.promo_code,
                'delivery_fee', v_existing_order.delivery_fee,
                'total', v_existing_order.total,
                'eta_minutes', v_existing_order.eta_minutes,
                'message', format('Uw bestelling %s was al eerder geplaatst.', upper(left(replace(v_existing_order.id::text, '-', ''), 8)))
            );
        end if;
    end if;

    v_calculation := public.voice_calculate_order(p_items, p_order_type, p_delivery_address, p_promo_code);
    if not coalesce((v_calculation->>'ok')::boolean, false) then
        return v_calculation;
    end if;

    insert into public.orders (
        customer_phone, order_type, delivery_address, total,
        subtotal, discount_amount, promotion_id, promo_code,
        delivery_fee, status, eta_minutes, call_id
    ) values (
        trim(p_customer_phone), p_order_type, nullif(trim(p_delivery_address), ''),
        (v_calculation->>'total')::numeric, (v_calculation->>'subtotal')::numeric,
        (v_calculation->>'discount_amount')::numeric,
        nullif(v_calculation->>'promotion_id', 'null')::uuid,
        nullif(v_calculation->>'promo_code', 'null'),
        (v_calculation->>'delivery_fee')::numeric,
        'pending', (v_calculation->>'eta_minutes')::integer, p_call_id
    ) returning id into v_order_id;

    for v_line in select value from jsonb_array_elements(v_calculation->'items')
    loop
        insert into public.order_items (
            order_id, menu_item_id, item_name, quantity, unit_price, notes, modifiers, line_total
        ) values (
            v_order_id, (v_line->>'menu_item_id')::uuid, v_line->>'name',
            (v_line->>'quantity')::integer, (v_line->>'unit_price')::numeric,
            coalesce(v_line->>'notes', ''), coalesce(v_line->'modifiers', '[]'::jsonb),
            (v_line->>'line_total')::numeric
        );
    end loop;

    return jsonb_build_object(
        'ok', true,
        'order_id', v_order_id,
        'order_number', upper(left(replace(v_order_id::text, '-', ''), 8)),
        'status', 'pending',
        'subtotal', v_calculation->'subtotal',
        'discount_amount', v_calculation->'discount_amount',
        'promotion_id', v_calculation->'promotion_id',
        'promo_code', v_calculation->'promo_code',
        'delivery_fee', v_calculation->'delivery_fee',
        'total', v_calculation->'total',
        'eta_minutes', v_calculation->'eta_minutes',
        'message', format('Uw bestelling %s is geplaatst. %s', upper(left(replace(v_order_id::text, '-', ''), 8)), v_calculation->>'message')
    );
exception
    when others then
        return jsonb_build_object('ok', false, 'message', 'Uw bestelling kon niet worden opgeslagen. Probeert u het zo opnieuw.');
end;
$$;

create or replace function public.voice_create_order(
    p_customer_phone text,
    p_order_type text,
    p_delivery_address text,
    p_items jsonb,
    p_call_id uuid default null
)
returns jsonb
language sql
as $$
    select public.voice_create_order(p_customer_phone, p_order_type, p_delivery_address, p_items, p_call_id, null);
$$;

create or replace function public.voice_check_availability(
    p_date date,
    p_time time,
    p_people_count integer
)
returns jsonb
language plpgsql
stable
as $$
declare
    v_day text;
    v_hours text;
    v_start time;
    v_end time;
    v_capacity integer := 20;
    v_booked integer := 0;
begin
    if p_date is null or p_time is null or p_people_count is null or p_people_count < 1 then
        return jsonb_build_object('ok', false, 'available', false, 'message', 'Geef een geldige datum, tijd en groepsgrootte door.');
    end if;

    v_day := (array['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'])[extract(dow from p_date)::integer + 1];
    select value->>v_day into v_hours
    from public.settings
    where key = 'opening_hours';

    if v_hours is null or lower(v_hours) = 'gesloten' or v_hours !~ '^[0-2][0-9]:[0-5][0-9]-[0-2][0-9]:[0-5][0-9]$' then
        return jsonb_build_object('ok', true, 'available', false, 'message', 'Op deze dag zijn we gesloten.');
    end if;

    v_start := split_part(v_hours, '-', 1)::time;
    v_end := split_part(v_hours, '-', 2)::time;
    if p_time < v_start or p_time >= v_end then
        return jsonb_build_object('ok', true, 'available', false, 'message', format('We zijn open van %s tot %s.', to_char(v_start, 'HH24:MI'), to_char(v_end, 'HH24:MI')));
    end if;

    select coalesce((value #>> '{}')::integer, 20)
    into v_capacity
    from public.settings
    where key = 'booking_slot_capacity';
    v_capacity := coalesce(v_capacity, 20);

    select coalesce(sum(people_count), 0)::integer
    into v_booked
    from public.bookings
    where date = p_date
      and time = p_time
      and status not in ('cancelled', 'no_show');

    if v_booked + p_people_count > v_capacity then
        return jsonb_build_object('ok', true, 'available', false, 'message', 'Dit tijdslot is helaas vol. Kiest u een andere tijd.');
    end if;

    return jsonb_build_object('ok', true, 'available', true, 'message', 'Er is plek op dit tijdstip.', 'date', p_date, 'time', p_time, 'people_count', p_people_count);
exception
    when others then
        return jsonb_build_object('ok', false, 'available', false, 'message', 'Beschikbaarheid controleren lukt nu niet. Probeert u het zo opnieuw.');
end;
$$;

create or replace function public.voice_create_booking(
    p_customer_phone text,
    p_customer_name text,
    p_service text,
    p_date date,
    p_time time,
    p_people_count integer
)
returns jsonb
language plpgsql
as $$
declare
    v_availability jsonb;
    v_booking_id uuid;
begin
    if nullif(trim(p_customer_phone), '') is null or nullif(trim(p_customer_name), '') is null or nullif(trim(p_service), '') is null then
        return jsonb_build_object('ok', false, 'message', 'Ik heb uw naam, telefoonnummer en gewenste dienst nodig.');
    end if;

    perform pg_advisory_xact_lock(hashtextextended(p_date::text || ' ' || p_time::text, 0));
    v_availability := public.voice_check_availability(p_date, p_time, p_people_count);
    if not coalesce((v_availability->>'available')::boolean, false) then
        return v_availability;
    end if;

    insert into public.bookings (
        customer_phone, customer_name, service, date, time, people_count, status
    ) values (
        trim(p_customer_phone), trim(p_customer_name), trim(p_service),
        p_date, p_time, p_people_count, 'confirmed'
    ) returning id into v_booking_id;

    return jsonb_build_object(
        'ok', true,
        'booking_id', v_booking_id,
        'confirmation_number', upper(left(replace(v_booking_id::text, '-', ''), 8)),
        'date', p_date,
        'time', p_time,
        'people_count', p_people_count,
        'message', format('Uw reservering is bevestigd voor %s om %s voor %s personen.', to_char(p_date, 'DD-MM-YYYY'), to_char(p_time, 'HH24:MI'), p_people_count)
    );
exception
    when others then
        return jsonb_build_object('ok', false, 'message', 'Uw reservering kon niet worden opgeslagen. Probeert u het zo opnieuw.');
end;
$$;

drop function if exists public.voice_save_end_call_report(text, text, text, text, integer, timestamptz, timestamptz);

create or replace function public.voice_save_end_call_report(
    p_vapi_call_id text,
    p_phone text,
    p_transcript text,
    p_summary text,
    p_duration_seconds integer,
    p_call_started_at timestamptz default null,
    p_call_ended_at timestamptz default null,
    p_recording_url text default null,
    p_transcript_messages jsonb default '[]'::jsonb,
    p_turn_metrics jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
    v_call public.calls%rowtype;
    v_order jsonb;
    v_booking jsonb;
    v_started_at timestamptz;
    v_ended_at timestamptz;
begin
    if nullif(trim(p_vapi_call_id), '') is null then
        return jsonb_build_object('ok', false, 'message', 'Het gespreksnummer ontbreekt.');
    end if;

    insert into public.calls (
        vapi_call_id, phone, transcript, transcript_messages, recording_url, turn_metrics, summary, duration_seconds
    ) values (
        trim(p_vapi_call_id), nullif(trim(p_phone), ''), coalesce(p_transcript, ''),
        coalesce(p_transcript_messages, '[]'::jsonb), nullif(trim(p_recording_url), ''),
        coalesce(p_turn_metrics, '[]'::jsonb), coalesce(p_summary, ''), p_duration_seconds
    )
    on conflict (vapi_call_id) do update set
        phone = coalesce(excluded.phone, public.calls.phone),
        transcript = coalesce(nullif(excluded.transcript, ''), public.calls.transcript),
        transcript_messages = case when jsonb_typeof(excluded.transcript_messages) = 'array' and jsonb_array_length(excluded.transcript_messages) > 0 then excluded.transcript_messages else public.calls.transcript_messages end,
        recording_url = coalesce(excluded.recording_url, public.calls.recording_url),
        turn_metrics = case when jsonb_typeof(excluded.turn_metrics) = 'array' and jsonb_array_length(excluded.turn_metrics) > 0 then excluded.turn_metrics else public.calls.turn_metrics end,
        summary = coalesce(nullif(excluded.summary, ''), public.calls.summary),
        duration_seconds = coalesce(excluded.duration_seconds, public.calls.duration_seconds),
        updated_at = now()
    returning * into v_call;

    if v_call.sms_status = 'sent' then
        return jsonb_build_object(
            'ok', true, 'duplicate', true, 'call_id', v_call.id,
            'phone', v_call.phone, 'sms_status', v_call.sms_status
        );
    end if;

    v_ended_at := coalesce(p_call_ended_at, now());
    v_started_at := coalesce(p_call_started_at, v_ended_at - interval '30 minutes');

     if v_call.phone is not null
         or exists (select 1 from public.orders where call_id = v_call.id)
         or exists (select 1 from public.bookings where call_id = v_call.id) then
        select jsonb_build_object(
            'id', o.id,
            'total', o.total,
            'order_type', o.order_type,
            'eta_minutes', o.eta_minutes,
            'status', o.status,
            'items', (
                select coalesce(jsonb_agg(jsonb_build_object('name', oi.item_name, 'quantity', oi.quantity)), '[]'::jsonb)
                from public.order_items oi
                where oi.order_id = o.id
            )
        )
        into v_order
        from public.orders o
        where o.status <> 'cancelled'
          and (o.call_id = v_call.id or (
              o.call_id is null
              and o.customer_phone = v_call.phone
              and o.created_at between v_started_at - interval '2 minutes' and v_ended_at + interval '5 minutes'
          ))
        order by coalesce(o.call_id = v_call.id, false) desc, o.created_at desc
        limit 1;

        if v_order is not null then
            update public.orders
            set call_id = v_call.id
            where id = (v_order->>'id')::uuid and call_id is null;
        end if;

        select jsonb_build_object(
            'id', b.id,
            'customer_name', b.customer_name,
            'service', b.service,
            'date', b.date,
            'time', b.time,
            'people_count', b.people_count,
            'status', b.status
        )
        into v_booking
        from public.bookings b
        where b.status not in ('cancelled', 'no_show')
          and (b.call_id = v_call.id or (
              b.call_id is null
              and b.customer_phone = v_call.phone
              and b.created_at between v_started_at - interval '2 minutes' and v_ended_at + interval '5 minutes'
          ))
        order by coalesce(b.call_id = v_call.id, false) desc, b.created_at desc
        limit 1;

        if v_booking is not null then
            update public.bookings
            set call_id = v_call.id
            where id = (v_booking->>'id')::uuid and call_id is null;
        end if;
    end if;

    return jsonb_build_object(
        'ok', true,
        'call_id', v_call.id,
        'phone', v_call.phone,
        'sms_status', v_call.sms_status,
        'order', v_order,
        'booking', v_booking
    );
end;
$$;

create or replace function public.voice_get_menu_prompt_context()
returns jsonb
language sql
stable
security invoker
as $$
with business_clock as (
    select now() as instant,
           extract(isodow from (now() at time zone 'Europe/Amsterdam'))::smallint as weekday
), active_promotions as (
    select promotion.*
    from public.promotions promotion
    cross join business_clock clock
    where promotion.is_active
      and promotion.starts_at <= clock.instant
      and promotion.ends_at > clock.instant
      and promotion.days_of_week @> array[clock.weekday]
), menu_payload as (
    select coalesce(
        jsonb_agg(jsonb_build_object(
            'name', name,
            'description', description,
            'price', price,
            'category', category,
            'prep_minutes', prep_minutes
        ) order by category, name),
        '[]'::jsonb
    ) as items
    from public.menu_items
    where available
), promotion_payload as (
    select case
        when count(*) = 0 then 'Er zijn vandaag geen actieve aanbiedingen.'
        else 'Actieve aanbiedingen vandaag:' || E'\n' || string_agg(
            '- ' || name || ': ' ||
            case
                when promo_type = 'percentage' then
                    case when discount_value = trunc(discount_value)
                        then trunc(discount_value)::text
                        else trim(to_char(discount_value, 'FM999999990D99'))
                    end || '% korting'
                when promo_type = 'flat_amount' then
                    'EUR ' || replace(to_char(discount_value, 'FM999999990D00'), '.', ',') || ' korting'
                else 'gratis ' || free_item
            end ||
            case when promo_code is not null then '. Gebruik code ' || promo_code else '' end ||
            case when minimum_order > 0 then '. Minimale bestelling EUR ' || replace(to_char(minimum_order, 'FM999999990D00'), '.', ',') else '' end,
            E'\n' order by name
        )
    end as text
    from active_promotions
)
select jsonb_build_object(
    'ok', true,
    'items', menu_payload.items,
    'promotions_text', promotion_payload.text
)
from menu_payload cross join promotion_payload;
$$;

create or replace function public.voice_update_call_sms_status(
    p_call_id uuid,
    p_sms_status text
)
returns void
language plpgsql
as $$
begin
    if p_sms_status not in ('sent', 'failed') then
        raise exception 'Invalid SMS status';
    end if;
    update public.calls set sms_status = p_sms_status where id = p_call_id;
end;
$$;

revoke all on function public.voice_calculate_order(jsonb, text) from public, anon, authenticated;
revoke all on function public.voice_calculate_order(jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public.voice_create_order(text, text, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.voice_create_order(text, text, text, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.voice_check_availability(date, time, integer) from public, anon, authenticated;
revoke all on function public.voice_create_booking(text, text, text, date, time, integer) from public, anon, authenticated;
revoke all on function public.voice_save_end_call_report(text, text, text, text, integer, timestamptz, timestamptz, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.voice_get_menu_prompt_context() from public, anon;
revoke all on function public.voice_update_call_sms_status(uuid, text) from public, anon, authenticated;
grant execute on function public.voice_calculate_order(jsonb, text) to service_role;
grant execute on function public.voice_calculate_order(jsonb, text, text, text) to service_role;
grant execute on function public.voice_create_order(text, text, text, jsonb, uuid) to service_role;
grant execute on function public.voice_create_order(text, text, text, jsonb, uuid, text) to service_role;
grant execute on function public.voice_check_availability(date, time, integer) to service_role;
grant execute on function public.voice_create_booking(text, text, text, date, time, integer) to service_role;
grant execute on function public.voice_save_end_call_report(text, text, text, text, integer, timestamptz, timestamptz, text, jsonb, jsonb) to service_role;
grant execute on function public.voice_get_menu_prompt_context() to authenticated, service_role;
grant execute on function public.voice_update_call_sms_status(uuid, text) to service_role;