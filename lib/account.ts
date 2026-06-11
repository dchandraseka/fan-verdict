import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from './types';

export async function ensureProfile(activeSession: Session): Promise<Profile> {
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', activeSession.user.id)
    .maybeSingle();

  if (existingProfile) return existingProfile as Profile;

  const fallbackName =
    activeSession.user.user_metadata?.display_name ||
    activeSession.user.user_metadata?.full_name ||
    activeSession.user.email?.split('@')[0] ||
    'FanVerdict Player';

  const { data: createdProfile, error } = await supabase
    .from('profiles')
    .insert({
      id: activeSession.user.id,
      email: activeSession.user.email,
      display_name: fallbackName,
      whatsapp_number: activeSession.user.user_metadata?.whatsapp_number ?? null,
      notification_channel: activeSession.user.user_metadata?.notification_channel === 'none' ? 'none' : 'email',
    })
    .select('*')
    .single();

  if (error) throw error;
  return createdProfile as Profile;
}
