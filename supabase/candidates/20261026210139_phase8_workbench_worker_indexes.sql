-- Forward-only indexes for the isolated worker. Never apply to hosted Supabase.
DO $$ BEGIN
 IF current_database() !~ '^synapse_workbench_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'Isolated database required'; END IF;
END $$;
CREATE INDEX worker_matches_draft ON workbench.matches(environment_id,(body->>'draftId'));
CREATE INDEX worker_translations_draft ON workbench.translations(environment_id,(body->>'draftId'));
CREATE INDEX worker_pending_blobs ON workbench.blobs(environment_id,created_at) WHERE scan='PENDING';
