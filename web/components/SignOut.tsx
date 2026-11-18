'use client';
import { supabaseBrowser } from '@/lib/supabase-browser';

// Signs out this computer only (scope 'local'). The default would end every session for this person:
// other browsers, the Overwatch site and the store site at once.
export function SignOut({ className = 'btn' }: { className?: string }) {
  return <button className={className} onClick={async () => { await supabaseBrowser().auth.signOut({ scope: 'local' }); location.href = '/'; }}>Sign out</button>;
}
