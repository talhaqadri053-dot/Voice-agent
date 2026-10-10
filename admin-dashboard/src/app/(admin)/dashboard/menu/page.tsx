import { MenuManagement } from '@/components/menu-management';
import { createClient } from '@/lib/supabase/server';

export default async function MenuPage() {
  const supabase = await createClient();

  const [itemsResult, groupsResult, optionsResult, itemGroupLinksResult, zonesResult] = await Promise.all([
    supabase.from('menu_items').select('*').order('category').order('name'),
    supabase.from('menu_modifier_groups').select('*').order('name'),
    supabase.from('menu_modifier_options').select('*').order('name'),
    supabase.from('menu_item_modifier_groups').select('*'),
    supabase.from('delivery_zones').select('*').order('name'),
  ]);

  const groups = (groupsResult.data ?? []).map((group) => ({
    ...group,
    options: (optionsResult.data ?? []).filter((option) => option.group_id === group.id),
    item_ids: (itemGroupLinksResult.data ?? [])
      .filter((link) => link.modifier_group_id === group.id)
      .map((link) => link.menu_item_id),
  }));

  return (
    <MenuManagement
      initialItems={itemsResult.data ?? []}
      modifierGroups={groups}
      deliveryZones={zonesResult.data ?? []}
      loadError={itemsResult.error ? 'load-failed' : null}
    />
  );
}