// Web processes use only the publishable key and a verified user's session.
// Operator credentials belong in a separately loaded, ignored operator env file.
export function assertWebEnvironment(env: Record<string, string | undefined>) {
  const forbidden = Object.keys(env).filter((name) =>
    Boolean(env[name]?.trim()) &&
    (["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL", "SYNAPSE_SLA_DATABASE_URL", "SYNAPSE_GEMINI_API_KEY", "SYNAPSE_GOOGLE_TRANSLATION_KEY", "SYNAPSE_GMAIL_CLIENT_SECRET"].includes(name.toUpperCase()) ||
      /^NEXT_PUBLIC_.*(SECRET|SERVICE_ROLE|DATABASE_URL|PASSWORD|PRIVATE_KEY|TOKEN|API_KEY|GMAIL|TRANSLATION_KEY)/i.test(name)),
  );
  if (forbidden.length)
    throw new Error(`Operator or private credentials cannot be loaded into a SYNAPSE web process: ${forbidden.sort().join(", ")}. Load .env.operator.local only for operator scripts.`);
}
