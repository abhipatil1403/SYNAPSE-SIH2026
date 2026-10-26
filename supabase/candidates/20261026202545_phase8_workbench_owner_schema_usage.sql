-- Confirmed local FK-trigger failure: table owners also need schema USAGE.
-- No DML, source-table, managed-schema or browser permission is added.
DO $$ BEGIN IF current_database() !~ '^synapse_workbench_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'Isolated database required'; END IF; END $$;
GRANT USAGE ON SCHEMA workbench TO synapse_workbench_owner;
