import type { SupabaseClient } from '@supabase/supabase-js';
import { validatedClaims } from './policy';
import { Phase1Error } from '../live/service';
type LiveAuth = Pick<SupabaseClient['auth'], 'refreshSession' | 'getUser'>;
/** The private web gateway requires provider-current refresh authority as well as a verified JWT.
 * A signed but logged-out access token alone can never open protected application data. */
export async function verifyCurrentSession(auth: LiveAuth, projectUrl: string) {
    const refreshed = await auth.refreshSession();
    if (refreshed.error || !refreshed.data.session)
        throw new Phase1Error(refreshed.error?.status && refreshed.error.status >= 500 ? 503 : 401, 'current_session_required', 'Your session is no longer active. Sign in again.');
    const { data, error } = await auth.getUser(refreshed.data.session.access_token);
    if (error || !data.user?.email)
        throw new Phase1Error(error?.status && error.status >= 500 ? 503 : 401, 'authentication_required', 'Sign in with your email and password.');
    return { user: data.user, claims: validatedClaims(refreshed.data.session.access_token, data.user, projectUrl) };
}
