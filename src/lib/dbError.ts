/**
 * Turns raw PostgREST / Postgres errors into messages a user can act on.
 *
 * The most common one in this app is:
 *   'new row violates row-level security policy for table "X"'
 * which almost always means the browser has no real Supabase JWT (demo mode),
 * or the signed-in user is not an active member of the active workspace.
 */

export function isDemoMode(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('k1_user_override') === 'true';
  } catch {
    return false;
  }
}

function tableFromRls(msg: string): string {
  const m = msg.match(/for table "([^"]+)"/);
  return m ? m[1].replace(/_/g, ' ') : 'this record';
}

export function describeDbError(err: unknown): string {
  const anyErr = err as any;
  const raw = String(anyErr?.message ?? anyErr ?? 'Something went wrong.');
  const code = String(anyErr?.code ?? '');
  const low = raw.toLowerCase();

  if (low.includes('row-level security') || code === '42501') {
    if (isDemoMode()) {
      return `You are in demo mode, so ${tableFromRls(raw)} cannot be saved to the database. Sign out of the demo panel and sign in with your real account to save data.`;
    }
    return `Your account does not have permission to write ${tableFromRls(raw)} in this workspace. Make sure you are signed in and are an active member of the selected workspace, then try again.`;
  }

  if (code === '23505' || low.includes('duplicate key')) {
    return 'A record with these details already exists. Change the code/name and try again.';
  }
  if (code === '23503' || low.includes('foreign key')) {
    return 'A linked record is missing or was deleted. Refresh the page and try again.';
  }
  if (code === '23502' || low.includes('null value in column')) {
    const m = raw.match(/column "([^"]+)"/);
    return m ? `"${m[1].replace(/_/g, ' ')}" is required.` : 'A required field is missing.';
  }
  if (code === '23514' || low.includes('check constraint')) {
    return 'One of the values is not allowed for this field. Please review the form.';
  }
  if (code === 'PGRST301' || low.includes('jwt') || low.includes('token is expired')) {
    return 'Your session has expired. Please sign in again.';
  }
  if (low.includes('failed to fetch') || low.includes('networkerror')) {
    return 'Could not reach the server. Check your connection and try again.';
  }

  return raw;
}
