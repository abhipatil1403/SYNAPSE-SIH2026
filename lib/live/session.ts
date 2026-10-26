import { Phase1Error } from "./service";

export interface SessionOperations {
  verifiedUser: () => Promise<boolean>;
  revokeCurrent: () => Promise<void>;
  providerSignOut: () => Promise<void>;
  clearCookies: () => void;
}
export async function endSession(operations: SessionOperations) {
  let failure = false;
  try {
    if (await operations.verifiedUser()) await operations.revokeCurrent();
  } catch {
    failure = true;
  }
  try {
    await operations.providerSignOut();
  } catch {
    failure = true;
  } finally {
    operations.clearCookies();
  }
  if (failure)
    throw new Phase1Error(
      503,
      "logout_incomplete",
      "Local cookies were cleared. Complete server-side sign-out could not be verified.",
    );
  return { signedOut: true };
}

export function sessionCookieName(name: string) {
  return (
    name === "synapse-phase1-session" ||
    /^synapse-phase1-session\.\d+$/.test(name)
  );
}
