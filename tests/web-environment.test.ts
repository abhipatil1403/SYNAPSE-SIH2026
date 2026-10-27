import { test } from "node:test";
import assert from "node:assert/strict";
import { assertWebEnvironment } from "../lib/web-environment";

test("web startup accepts public project configuration and rejects inherited operator secrets without displaying values", () => {
  assert.doesNotThrow(() => assertWebEnvironment({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid", SUPABASE_SECRET_KEY: "" }));
  for (const name of ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL", "SYNAPSE_SLA_DATABASE_URL", "SYNAPSE_GEMINI_API_KEY", "database_url", "supabase_secret_key", "NEXT_PUBLIC_SUPABASE_SECRET_KEY", "NEXT_PUBLIC_SERVICE_ROLE_KEY", "NEXT_PUBLIC_DATABASE_URL", "NEXT_PUBLIC_SESSION_TOKEN"]) {
    assert.throws(() => assertWebEnvironment({ [name]: "private-sentinel-value" }), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes(name));
      assert.ok(!error.message.includes("private-sentinel-value"));
      return true;
    });
  }
});

test('dedicated cloud provider keys are server-only; public aliases remain forbidden',()=>{assert.doesNotThrow(()=>assertWebEnvironment({SYNAPSE_GEMINI_EMBEDDINGS_API_KEY:'server-only-sentinel',SYNAPSE_GOOGLE_TRANSLATION_KEY:'server-only-sentinel'}));for(const name of ['NEXT_PUBLIC_GEMINI_API_KEY','NEXT_PUBLIC_GOOGLE_TRANSLATION_KEY','NEXT_PUBLIC_GMAIL_CLIENT_SECRET','NEXT_PUBLIC_SCANNER_URL','NEXT_PUBLIC_SCANNER_TOKEN'])assert.throws(()=>assertWebEnvironment({[name]:'server-only-sentinel'}));});
