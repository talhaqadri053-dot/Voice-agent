import { SettingsManagement } from '@/components/settings-management';
import { createClient } from '@/lib/supabase/server';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('settings').select('*').order('key');
  return <SettingsManagement initialSettings={data ?? []} loadError={error ? 'load-failed' : null} />;
}