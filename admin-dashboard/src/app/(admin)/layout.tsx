import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin-shell';
import { AMSTERDAM_TIME_ZONE } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const now = new Date();
  const [{ data: businessSetting }, { count: recentCallCount }] = await Promise.all([
    supabase.from('settings').select('value').eq('key', 'business_name').maybeSingle(),
    supabase.from('calls').select('id', { count: 'exact', head: true }).gte('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()),
  ]);
  const businessName = typeof businessSetting?.value === 'string' && businessSetting.value.trim()
    ? businessSetting.value.trim()
    : 'Restaurant';
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: AMSTERDAM_TIME_ZONE }).format(now);

  return <AdminShell email={user.email ?? 'admin'} businessName={businessName} weekday={weekday} assistantActive={(recentCallCount ?? 0) > 0}>{children}</AdminShell>;
}