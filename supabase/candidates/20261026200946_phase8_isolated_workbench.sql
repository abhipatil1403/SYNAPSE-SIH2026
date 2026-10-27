-- ISOLATED DEVELOPMENT ONLY. This is not a Supabase-hosted migration.
-- The installer must pin a new loopback-only database and explicit environment.
DO $$ BEGIN
 IF current_database() !~ '^synapse_workbench_[a-f0-9]{12}$' OR current_setting('synapse.workbench.install',true) IS DISTINCT FROM 'isolated-development-approved'
 THEN RAISE EXCEPTION 'Refusing to install outside the dedicated isolated development database'; END IF;
END $$;
CREATE ROLE synapse_workbench_owner NOLOGIN NOINHERIT NOBYPASSRLS;
CREATE ROLE synapse_workbench_runtime NOLOGIN NOINHERIT NOBYPASSRLS;
CREATE SCHEMA workbench;
REVOKE ALL ON SCHEMA workbench FROM PUBLIC;
GRANT USAGE ON SCHEMA workbench TO synapse_workbench_runtime;
CREATE TABLE workbench.meta(environment_id uuid PRIMARY KEY,revision bigint NOT NULL DEFAULT 1,next_case_number bigint NOT NULL DEFAULT 1,mode text NOT NULL CHECK(mode='ISOLATED_DEVELOPMENT'),schema_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
DO $tables$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['staff','bureaus','institutions','categories','cases','drafts','tasks','evidence','matches','relationships','findings','policies','comments','activity','sla','events','notifications','accessRequests','transfers','actions','conflicts','translations'] LOOP
  EXECUTE format('CREATE TABLE workbench.%I(id uuid PRIMARY KEY,environment_id uuid NOT NULL REFERENCES workbench.meta(environment_id),body jsonb NOT NULL CHECK(jsonb_typeof(body)=''object'' AND (body->>''id'')::uuid=id))',t);
 END LOOP;
END $tables$;
CREATE UNIQUE INDEX institution_permanent_id ON workbench.institutions(environment_id,(body->>'permanentId')) WHERE body ? 'permanentId';
CREATE UNIQUE INDEX case_number_unique ON workbench.cases(environment_id,(body->>'caseNumber'));
CREATE UNIQUE INDEX draft_source_unique ON workbench.drafts(environment_id,(body->>'source'),(body->>'sourceReference'));
CREATE UNIQUE INDEX staff_auth_unique ON workbench.staff(environment_id,(body->>'authId'));
DO $relations$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['tasks','evidence','comments','activity','sla','events','notifications','accessRequests','transfers','actions'] LOOP
  EXECUTE format('ALTER TABLE workbench.%I ADD COLUMN case_id uuid GENERATED ALWAYS AS ((body->>''caseId'')::uuid) STORED REFERENCES workbench.cases(id) DEFERRABLE INITIALLY DEFERRED',t);
  EXECUTE format('CREATE INDEX ON workbench.%I(environment_id,case_id)',t);
 END LOOP;
END $relations$;
ALTER TABLE workbench.cases ADD COLUMN institution_id uuid GENERATED ALWAYS AS ((body->>'institutionId')::uuid) STORED REFERENCES workbench.institutions(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE workbench.cases ADD COLUMN bureau_id uuid GENERATED ALWAYS AS ((body->>'bureauId')::uuid) STORED REFERENCES workbench.bureaus(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE workbench.drafts ADD COLUMN institution_id uuid GENERATED ALWAYS AS ((body->>'institutionId')::uuid) STORED REFERENCES workbench.institutions(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE workbench.relationships ADD COLUMN source_id uuid GENERATED ALWAYS AS ((body->>'sourceId')::uuid) STORED REFERENCES workbench.cases(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE workbench.relationships ADD COLUMN target_id uuid GENERATED ALWAYS AS ((body->>'targetId')::uuid) STORED REFERENCES workbench.cases(id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE workbench.grants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),environment_id uuid NOT NULL REFERENCES workbench.meta,case_id uuid NOT NULL REFERENCES workbench.cases DEFERRABLE INITIALLY DEFERRED,user_id uuid NOT NULL REFERENCES workbench.staff,scope text NOT NULL CHECK(scope IN('DETAILS','DOCUMENTS','COORDINATE')),valid_until timestamptz NOT NULL,revoked boolean NOT NULL DEFAULT false,UNIQUE(environment_id,case_id,user_id,scope,valid_until));
CREATE TABLE workbench.evaluations(id uuid PRIMARY KEY,environment_id uuid NOT NULL REFERENCES workbench.meta,case_id uuid NOT NULL REFERENCES workbench.cases,body jsonb NOT NULL);
CREATE TABLE workbench.receipts(id text PRIMARY KEY,environment_id uuid NOT NULL REFERENCES workbench.meta,input text NOT NULL,result jsonb NOT NULL);
CREATE TABLE workbench.delegations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),environment_id uuid NOT NULL REFERENCES workbench.meta,user_id uuid NOT NULL REFERENCES workbench.staff,bureau_id uuid NOT NULL REFERENCES workbench.bureaus,role_code text NOT NULL CHECK(role_code IN('BUREAU_HEAD','CASE_OFFICER','AUDITOR')),actor_id uuid NOT NULL REFERENCES workbench.staff,valid_until timestamptz NOT NULL,reason text NOT NULL CHECK(length(reason)>=5));
CREATE TABLE workbench.blobs(id uuid PRIMARY KEY,environment_id uuid NOT NULL REFERENCES workbench.meta,case_id uuid NOT NULL REFERENCES workbench.cases,version_id uuid NOT NULL,name text NOT NULL,media_type text NOT NULL,sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),bytes bytea NOT NULL CHECK(octet_length(bytes) BETWEEN 1 AND 10485760),scan text NOT NULL CHECK(scan IN('PENDING','CLEAN','INFECTED','NOT_REQUIRED')),uploader_id uuid NOT NULL REFERENCES workbench.staff,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE workbench.jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),environment_id uuid NOT NULL REFERENCES workbench.meta,kind text NOT NULL CHECK(kind IN('EMAIL','MATCH','TRANSLATE')),target_id uuid,actor_id uuid REFERENCES workbench.staff,bureau_id uuid REFERENCES workbench.bureaus,dedupe_key text NOT NULL UNIQUE,payload jsonb NOT NULL DEFAULT '{}',status text NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','RUNNING','SUCCEEDED','BLOCKED','FAILED')),attempts integer NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,lease_token uuid,error_code text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX job_claim ON workbench.jobs(environment_id,status,available_at,created_at);
CREATE TABLE workbench.message_receipts(environment_id uuid NOT NULL REFERENCES workbench.meta,mailbox text NOT NULL,message_id text NOT NULL,body_fingerprint text NOT NULL,sender_fingerprint text NOT NULL,job_id uuid NOT NULL REFERENCES workbench.jobs,PRIMARY KEY(environment_id,mailbox,message_id));
CREATE INDEX message_fingerprint ON workbench.message_receipts(environment_id,body_fingerprint);
CREATE TABLE workbench.mail_cursors(environment_id uuid NOT NULL REFERENCES workbench.meta,mailbox text NOT NULL,page_token text,history_id text,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(environment_id,mailbox));
CREATE TABLE workbench.draft_indexes(draft_id uuid PRIMARY KEY REFERENCES workbench.drafts,environment_id uuid NOT NULL REFERENCES workbench.meta,institution_id uuid REFERENCES workbench.institutions,fingerprint text NOT NULL,lexemes tsvector NOT NULL,embedding real[],model_version text,updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX candidate_institution ON workbench.draft_indexes(environment_id,institution_id,updated_at DESC);
CREATE INDEX candidate_fingerprint ON workbench.draft_indexes(environment_id,fingerprint);
CREATE INDEX candidate_lexemes ON workbench.draft_indexes USING gin(lexemes);
CREATE TABLE workbench.sla_rules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),environment_id uuid NOT NULL REFERENCES workbench.meta,policy_id uuid NOT NULL REFERENCES workbench.policies,reminder_minutes integer NOT NULL CHECK(reminder_minutes BETWEEN 1 AND 525600),enabled boolean NOT NULL DEFAULT false,actor_id uuid NOT NULL REFERENCES workbench.staff,reason text NOT NULL);
CREATE TABLE workbench.deliveries(id text PRIMARY KEY,environment_id uuid NOT NULL REFERENCES workbench.meta,sla_id uuid NOT NULL REFERENCES workbench.sla,recipient_id uuid NOT NULL REFERENCES workbench.staff,kind text NOT NULL,due_at timestamptz NOT NULL,notification_id uuid NOT NULL REFERENCES workbench.notifications DEFERRABLE INITIALLY DEFERRED,created_at timestamptz NOT NULL DEFAULT now());
-- This role is a trusted, private, server-only development boundary. It is not
-- an authenticated/anonymous browser database principal. Every API also checks
-- actual Supabase identity/current authority and projects case/document scope.
DO $security$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='workbench' LOOP
  EXECUTE format('ALTER TABLE workbench.%I OWNER TO synapse_workbench_owner',t.tablename);
  EXECUTE format('ALTER TABLE workbench.%I ENABLE ROW LEVEL SECURITY',t.tablename);
  EXECUTE format('ALTER TABLE workbench.%I FORCE ROW LEVEL SECURITY',t.tablename);
  EXECUTE format('CREATE POLICY isolated_runtime ON workbench.%I TO synapse_workbench_runtime USING(environment_id=nullif(current_setting(''synapse.workbench_id'',true),'''')::uuid) WITH CHECK(environment_id=nullif(current_setting(''synapse.workbench_id'',true),'''')::uuid)',t.tablename);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON workbench.%I TO synapse_workbench_runtime',t.tablename);
 END LOOP;
END $security$;
-- The schema is not exposed by Supabase, and has no public definer RPCs.
