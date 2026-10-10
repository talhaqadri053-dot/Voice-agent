import { PromotionsManagement } from '@/components/promotions-management';
import { createClient } from '@/lib/supabase/server';

export default async function PromotionsPage() {
  const supabase = await createClient();
  const [promotionsResult, promptResult] = await Promise.all([
    supabase.from('promotions').select('*').order('starts_at', { ascending: false }),
    supabase.rpc('voice_get_menu_prompt_context'),
  ]);
  const context = promptResult.data && typeof promptResult.data === 'object' && !Array.isArray(promptResult.data)
    ? promptResult.data
    : null;

  return (
    <PromotionsManagement
      initialPromotions={promotionsResult.data ?? []}
      initialNow={new Date().toISOString()}
      promptText={typeof context?.promotions_text === 'string' ? context.promotions_text : null}
      loadError={promotionsResult.error ? 'Promotions could not be loaded. Apply supabase_schema.sql first.' : null}
      promptError={promptResult.error ? 'The AI preview is unavailable. Apply n8n_supabase_functions.sql as well.' : null}
    />
  );
}