-- Captured application-schema baseline. Restore ONLY into an empty disposable database.

-- Never apply this file to the deployed project or register it as a new deployed migration.

-- Managed auth/storage schemas and operational records are intentionally excluded.

BEGIN;

SET check_function_bodies = off;

DO $$ BEGIN IF EXISTS (SELECT FROM pg_namespace WHERE nspname='synapse') THEN RAISE EXCEPTION 'Baseline restore requires an absent synapse schema; nothing was reset'; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='synapse_app') THEN CREATE ROLE "synapse_app" NOLOGIN NOBYPASSRLS; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='synapse_ingest') THEN CREATE ROLE "synapse_ingest" NOLOGIN NOBYPASSRLS; END IF; END $$;

CREATE SCHEMA "synapse";

CREATE TABLE "synapse"."ai_model_versions" (
  "ai_model_version_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "capability_code" text NOT NULL,
  "provider_name" text NOT NULL,
  "model_name" text NOT NULL,
  "model_version" text NOT NULL,
  "configuration_hash" character(64),
  "active_from" timestamp with time zone,
  "active_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."audit_events" (
  "audit_event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "actor_user_id" uuid,
  "event_type" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "request_id" text,
  "reason" text,
  "before_state" jsonb,
  "after_state" jsonb,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "previous_event_hash" text,
  "event_hash" text
);

CREATE TABLE "synapse"."bureaus" (
  "bureau_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "bureau_code" text NOT NULL,
  "bureau_name" text NOT NULL,
  "parent_bureau_id" uuid,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."case_access_grant_approvals" (
  "case_access_grant_approval_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_access_request_id" uuid NOT NULL,
  "case_id" uuid NOT NULL,
  "approver_user_id" uuid NOT NULL,
  "approving_bureau_id" uuid NOT NULL,
  "decision" text NOT NULL,
  "decision_reason" text NOT NULL,
  "decided_at" timestamp with time zone DEFAULT now() NOT NULL,
  "grant_id" uuid
);

CREATE TABLE "synapse"."case_access_grants" (
  "case_access_grant_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "user_id" uuid,
  "bureau_id" uuid,
  "granted_scope" text NOT NULL,
  "granted_by_user_id" uuid NOT NULL,
  "source_request_id" uuid,
  "valid_from" timestamp with time zone DEFAULT now() NOT NULL,
  "valid_until" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "revoke_reason" text
);

CREATE TABLE "synapse"."case_access_requests" (
  "case_access_request_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "requester_user_id" uuid NOT NULL,
  "requested_scope" text NOT NULL,
  "reason" text NOT NULL,
  "request_status" text DEFAULT 'PENDING'::text NOT NULL,
  "approver_user_id" uuid,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "decided_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "decision_reason" text
);

CREATE TABLE "synapse"."case_assignments" (
  "case_assignment_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "bureau_id" uuid NOT NULL,
  "officer_id" uuid,
  "assignment_role" text NOT NULL,
  "valid_from" timestamp with time zone DEFAULT now() NOT NULL,
  "valid_until" timestamp with time zone,
  "assigned_by_user_id" uuid,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."case_categories" (
  "category_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "category_code" text NOT NULL,
  "category_name" text NOT NULL,
  "parent_category_id" uuid,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."case_comments" (
  "case_comment_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "work_item_id" uuid,
  "author_user_id" uuid NOT NULL,
  "comment_body" text NOT NULL,
  "visibility" text DEFAULT 'CASE_AUTHORIZED'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "edited_at" timestamp with time zone
);

CREATE TABLE "synapse"."case_issue_links" (
  "case_id" uuid NOT NULL,
  "issue_id" uuid NOT NULL,
  "link_status" text DEFAULT 'PROPOSED'::text NOT NULL,
  "linked_by_user_id" uuid,
  "reviewed_by_user_id" uuid,
  "linked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_at" timestamp with time zone,
  "review_reason" text
);

CREATE TABLE "synapse"."case_relationship_types" (
  "relationship_type" text NOT NULL,
  "is_directed" boolean NOT NULL,
  "allow_cycle" boolean DEFAULT false NOT NULL,
  "description" text NOT NULL
);

CREATE TABLE "synapse"."case_relationships" (
  "case_relationship_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "source_case_id" uuid NOT NULL,
  "target_case_id" uuid NOT NULL,
  "relationship_type" text NOT NULL,
  "relationship_status" text DEFAULT 'PROPOSED'::text NOT NULL,
  "proposed_by_user_id" uuid,
  "reviewed_by_user_id" uuid,
  "rationale" text,
  "source_conflict_finding_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_at" timestamp with time zone
);

CREATE TABLE "synapse"."case_status_history" (
  "case_status_history_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "from_status_code" text,
  "to_status_code" text NOT NULL,
  "changed_by_user_id" uuid,
  "change_reason" text,
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."case_statuses" (
  "status_code" text NOT NULL,
  "display_name" text NOT NULL,
  "is_terminal" boolean DEFAULT false NOT NULL,
  "sort_order" integer NOT NULL
);

CREATE TABLE "synapse"."case_submissions" (
  "submission_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "inbound_message_id" uuid,
  "source_type" text NOT NULL,
  "source_reference" text,
  "institution_id" uuid,
  "submitted_by_user_id" uuid,
  "complainant_reference" text,
  "original_language_code" text DEFAULT 'en'::text NOT NULL,
  "original_subject" text,
  "original_body" text,
  "submission_status" text DEFAULT 'DRAFT'::text NOT NULL,
  "duplicate_of_submission_id" uuid,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_by_user_id" uuid,
  "reviewed_at" timestamp with time zone,
  "review_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."case_transfer_approvals" (
  "case_transfer_approval_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_transfer_id" uuid NOT NULL,
  "approval_side" text NOT NULL,
  "approver_user_id" uuid NOT NULL,
  "decision" text NOT NULL,
  "decision_reason" text NOT NULL,
  "decided_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."case_transfers" (
  "case_transfer_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "from_bureau_id" uuid NOT NULL,
  "to_bureau_id" uuid NOT NULL,
  "from_officer_id" uuid,
  "to_officer_id" uuid,
  "requested_by_user_id" uuid NOT NULL,
  "approved_by_user_id" uuid,
  "transfer_status" text DEFAULT 'REQUESTED'::text NOT NULL,
  "reason" text NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "decided_at" timestamp with time zone,
  "completed_at" timestamp with time zone
);

CREATE TABLE "synapse"."case_work_items" (
  "work_item_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "bureau_id" uuid NOT NULL,
  "assigned_to_user_id" uuid,
  "work_item_type" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "status_code" text DEFAULT 'OPEN'::text NOT NULL,
  "due_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."cases" (
  "case_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_number" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT 1 MINVALUE 1 MAXVALUE 9223372036854775807 START 1 CACHE 1 NO CYCLE) NOT NULL,
  "institution_id" uuid NOT NULL,
  "campus_id" uuid,
  "category_id" uuid NOT NULL,
  "current_status_code" text NOT NULL,
  "lead_bureau_id" uuid NOT NULL,
  "accountable_officer_id" uuid,
  "title" text NOT NULL,
  "summary" text,
  "priority_code" text DEFAULT 'NORMAL'::text NOT NULL,
  "confidentiality_level" text DEFAULT 'RESTRICTED'::text NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "opened_at" timestamp with time zone,
  "disposed_at" timestamp with time zone,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "row_version" bigint DEFAULT 1 NOT NULL
);

CREATE TABLE "synapse"."claim_source_references" (
  "claim_source_reference_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "evidence_claim_id" uuid NOT NULL,
  "document_version_id" uuid NOT NULL,
  "page_number" integer,
  "paragraph_number" integer,
  "character_start" integer,
  "character_end" integer,
  "quoted_text" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."closure_approvals" (
  "closure_approval_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "closure_evaluation_id" uuid NOT NULL,
  "approver_user_id" uuid NOT NULL,
  "decision" text NOT NULL,
  "decision_reason" text NOT NULL,
  "decided_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."closure_checklist_versions" (
  "closure_checklist_version_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "closure_checklist_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "policy_version_id" uuid,
  "effective_from" timestamp with time zone NOT NULL,
  "effective_until" timestamp with time zone,
  "approved_by_user_id" uuid,
  "approved_at" timestamp with time zone,
  "status" text DEFAULT 'DRAFT'::text NOT NULL
);

CREATE TABLE "synapse"."closure_checklists" (
  "closure_checklist_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "checklist_code" text NOT NULL,
  "checklist_name" text NOT NULL,
  "category_id" uuid,
  "is_active" boolean DEFAULT true NOT NULL
);

CREATE TABLE "synapse"."closure_evaluation_items" (
  "closure_evaluation_id" uuid NOT NULL,
  "closure_requirement_id" uuid NOT NULL,
  "result_code" text NOT NULL,
  "evidence_item_id" uuid,
  "notes" text
);

CREATE TABLE "synapse"."closure_evaluations" (
  "closure_evaluation_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "closure_checklist_version_id" uuid NOT NULL,
  "evaluation_status" text NOT NULL,
  "evaluated_by_user_id" uuid,
  "evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "evaluation_summary" text,
  "is_final" boolean DEFAULT false NOT NULL
);

CREATE TABLE "synapse"."closure_exceptions" (
  "closure_exception_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "case_id" uuid NOT NULL,
  "closure_requirement_id" uuid NOT NULL,
  "requested_by_user_id" uuid NOT NULL,
  "approved_by_user_id" uuid,
  "exception_status" text DEFAULT 'REQUESTED'::text NOT NULL,
  "reason" text NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "decided_at" timestamp with time zone
);

CREATE TABLE "synapse"."closure_requirements" (
  "closure_requirement_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "closure_checklist_version_id" uuid NOT NULL,
  "requirement_code" text NOT NULL,
  "requirement_text" text NOT NULL,
  "requirement_type" text NOT NULL,
  "is_mandatory" boolean DEFAULT true NOT NULL,
  "blocks_disposal" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "synapse"."conflict_finding_actions" (
  "conflict_finding_id" uuid NOT NULL,
  "regulatory_action_id" uuid NOT NULL,
  "relation_to_finding" text NOT NULL
);

CREATE TABLE "synapse"."conflict_findings" (
  "conflict_finding_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "conflict_rule_id" uuid NOT NULL,
  "institution_id" uuid NOT NULL,
  "finding_status" text DEFAULT 'DETECTED'::text NOT NULL,
  "severity_code" text NOT NULL,
  "confidence" numeric(5,4),
  "explanation" text NOT NULL,
  "triggering_facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_by_user_id" uuid,
  "reviewed_at" timestamp with time zone,
  "review_reason" text,
  "resolution_notes" text,
  "resolved_at" timestamp with time zone
);

CREATE TABLE "synapse"."conflict_rule_action_links" (
  "conflict_rule_id" uuid NOT NULL,
  "regulatory_action_id" uuid NOT NULL
);

CREATE TABLE "synapse"."conflict_rules" (
  "conflict_rule_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "rule_code" text NOT NULL,
  "rule_name" text NOT NULL,
  "description" text NOT NULL,
  "policy_version_id" uuid,
  "rule_definition" jsonb NOT NULL,
  "severity_code" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "version_number" integer NOT NULL,
  "created_by_user_id" uuid,
  "approved_by_user_id" uuid,
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."contradiction_findings" (
  "contradiction_finding_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "claim_a_id" uuid NOT NULL,
  "claim_b_id" uuid NOT NULL,
  "finding_status" text DEFAULT 'DETECTED'::text NOT NULL,
  "contradiction_type" text NOT NULL,
  "explanation" text NOT NULL,
  "confidence" numeric(5,4),
  "model_name" text,
  "model_version" text,
  "rule_version" text,
  "detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_by_user_id" uuid,
  "reviewed_at" timestamp with time zone,
  "review_reason" text
);

CREATE TABLE "synapse"."document_extractions" (
  "document_extraction_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "document_version_id" uuid NOT NULL,
  "extraction_engine" text NOT NULL,
  "engine_version" text,
  "detected_language_code" text,
  "extracted_text_storage_key" text,
  "extraction_status" text NOT NULL,
  "confidence" numeric(5,4),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "error_code" text,
  "error_detail" text
);

CREATE TABLE "synapse"."document_versions" (
  "document_version_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "storage_key" text NOT NULL,
  "original_filename" text NOT NULL,
  "media_type" text NOT NULL,
  "byte_size" bigint NOT NULL,
  "sha256_hex" character(64) NOT NULL,
  "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "uploaded_by_user_id" uuid,
  "malware_scan_status" text DEFAULT 'PENDING'::text NOT NULL
);

CREATE TABLE "synapse"."documents" (
  "document_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "document_type" text NOT NULL,
  "owner_case_id" uuid,
  "owner_submission_id" uuid,
  "uploaded_by_user_id" uuid,
  "confidentiality_level" text DEFAULT 'RESTRICTED'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."evidence_claims" (
  "evidence_claim_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "evidence_item_id" uuid NOT NULL,
  "claim_text" text NOT NULL,
  "normalized_claim" text,
  "subject_reference" text,
  "predicate_code" text,
  "object_value" text,
  "valid_from" date,
  "valid_until" date,
  "claim_extraction_method" text NOT NULL,
  "model_name" text,
  "model_version" text,
  "confidence" numeric(5,4),
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."evidence_items" (
  "evidence_item_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "document_version_id" uuid NOT NULL,
  "case_id" uuid,
  "regulatory_action_id" uuid,
  "evidence_type" text NOT NULL,
  "evidence_status" text DEFAULT 'SUBMITTED'::text NOT NULL,
  "source_description" text,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "verified_by_user_id" uuid,
  "verified_at" timestamp with time zone
);

CREATE TABLE "synapse"."inbound_messages" (
  "inbound_message_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "integration_source_id" uuid NOT NULL,
  "external_message_id" text,
  "internet_message_id" text,
  "sender_address" text,
  "subject" text,
  "received_at" timestamp with time zone NOT NULL,
  "raw_body_storage_key" text,
  "normalized_fingerprint" text NOT NULL,
  "message_status" text DEFAULT 'RECEIVED'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."institution_aliases" (
  "institution_alias_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "alias_name" text NOT NULL,
  "alias_type" text DEFAULT 'ALTERNATE'::text NOT NULL,
  "valid_from" date,
  "valid_until" date,
  "source_reference" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."institution_campuses" (
  "campus_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "campus_code" text,
  "campus_name" text NOT NULL,
  "address_line1" text,
  "city" text,
  "district" text,
  "state_name" text,
  "postal_code" text,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."institution_identifiers" (
  "institution_identifier_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "identifier_type" text NOT NULL,
  "identifier_value" text NOT NULL,
  "issuing_authority" text DEFAULT 'AICTE'::text NOT NULL,
  "valid_from" date,
  "valid_until" date,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."institutions" (
  "institution_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "canonical_name" text NOT NULL,
  "institution_type" text,
  "region_id" uuid,
  "address_line1" text,
  "address_line2" text,
  "city" text,
  "district" text,
  "state_name" text,
  "postal_code" text,
  "country_code" character(2) DEFAULT 'IN'::bpchar NOT NULL,
  "institution_status" text DEFAULT 'ACTIVE'::text NOT NULL,
  "source_system" text,
  "source_record_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."integration_events" (
  "integration_event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "integration_source_id" uuid NOT NULL,
  "external_event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "payload_hash" character(64) NOT NULL,
  "event_status" text DEFAULT 'RECEIVED'::text NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "last_error" text
);

CREATE TABLE "synapse"."integration_reconciliation_runs" (
  "reconciliation_run_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "integration_source_id" uuid NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "run_status" text NOT NULL,
  "records_examined" bigint DEFAULT 0 NOT NULL,
  "discrepancies_found" bigint DEFAULT 0 NOT NULL,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE "synapse"."integration_sources" (
  "integration_source_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "source_code" text NOT NULL,
  "source_name" text NOT NULL,
  "source_type" text NOT NULL,
  "configuration_reference" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."issues" (
  "issue_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "issue_title" text NOT NULL,
  "issue_description" text,
  "issue_status" text DEFAULT 'OPEN'::text NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."match_candidates" (
  "match_candidate_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "match_run_id" uuid NOT NULL,
  "candidate_case_id" uuid,
  "candidate_submission_id" uuid,
  "match_classification" text NOT NULL,
  "overall_score" numeric(5,4),
  "feature_scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "explanation" text NOT NULL,
  "review_status" text DEFAULT 'PENDING'::text NOT NULL,
  "reviewed_by_user_id" uuid,
  "reviewed_at" timestamp with time zone,
  "review_reason" text
);

CREATE TABLE "synapse"."match_runs" (
  "match_run_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "submission_id" uuid NOT NULL,
  "ai_model_version_id" uuid,
  "algorithm_code" text NOT NULL,
  "run_stage" text NOT NULL,
  "run_status" text NOT NULL,
  "parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "error_detail" text
);

CREATE TABLE "synapse"."notification_deliveries" (
  "notification_delivery_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "notification_id" uuid NOT NULL,
  "channel" text NOT NULL,
  "delivery_status" text DEFAULT 'QUEUED'::text NOT NULL,
  "provider_message_id" text,
  "attempt_number" integer DEFAULT 1 NOT NULL,
  "attempted_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "error_detail" text
);

CREATE TABLE "synapse"."notifications" (
  "notification_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "recipient_user_id" uuid NOT NULL,
  "notification_type" text NOT NULL,
  "subject" text NOT NULL,
  "body" text NOT NULL,
  "related_case_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "read_at" timestamp with time zone
);

CREATE TABLE "synapse"."permissions" (
  "permission_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "permission_code" text NOT NULL,
  "description" text NOT NULL
);

CREATE TABLE "synapse"."policy_sources" (
  "policy_source_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "source_code" text NOT NULL,
  "title" text NOT NULL,
  "issuing_authority" text NOT NULL,
  "source_uri" text,
  "source_type" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."policy_versions" (
  "policy_version_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "policy_source_id" uuid NOT NULL,
  "version_label" text NOT NULL,
  "effective_from" date NOT NULL,
  "effective_until" date,
  "content_hash" character(64),
  "approved_by_user_id" uuid,
  "approved_at" timestamp with time zone,
  "status" text DEFAULT 'DRAFT'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."regions" (
  "region_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "region_code" text NOT NULL,
  "region_name" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."regulatory_action_participants" (
  "regulatory_action_id" uuid NOT NULL,
  "bureau_id" uuid NOT NULL,
  "participant_role" text NOT NULL,
  "added_by_user_id" uuid,
  "added_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."regulatory_actions" (
  "regulatory_action_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "institution_id" uuid NOT NULL,
  "case_id" uuid,
  "lead_bureau_id" uuid NOT NULL,
  "action_type" text NOT NULL,
  "action_title" text NOT NULL,
  "action_status" text DEFAULT 'PROPOSED'::text NOT NULL,
  "planned_start_at" timestamp with time zone,
  "planned_end_at" timestamp with time zone,
  "actual_start_at" timestamp with time zone,
  "actual_end_at" timestamp with time zone,
  "policy_version_id" uuid,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."retention_actions" (
  "retention_action_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "retention_policy_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "action_code" text NOT NULL,
  "performed_by_user_id" uuid,
  "performed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reason" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE "synapse"."retention_policies" (
  "retention_policy_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "policy_code" text NOT NULL,
  "entity_type" text NOT NULL,
  "retention_days" integer,
  "action_code" text NOT NULL,
  "policy_version_id" uuid,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."role_permissions" (
  "role_id" uuid NOT NULL,
  "permission_id" uuid NOT NULL
);

CREATE TABLE "synapse"."roles" (
  "role_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "role_code" text NOT NULL,
  "role_name" text NOT NULL,
  "description" text,
  "is_system_role" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL
);

CREATE TABLE "synapse"."sla_events" (
  "sla_event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "sla_instance_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "actor_user_id" uuid,
  "reason" text,
  "previous_due_at" timestamp with time zone,
  "new_due_at" timestamp with time zone,
  "policy_version_id" uuid
);

CREATE TABLE "synapse"."sla_instances" (
  "sla_instance_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "sla_policy_version_id" uuid NOT NULL,
  "case_id" uuid,
  "work_item_id" uuid,
  "cycle_number" integer DEFAULT 1 NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "original_due_at" timestamp with time zone NOT NULL,
  "current_due_at" timestamp with time zone NOT NULL,
  "sla_status" text DEFAULT 'RUNNING'::text NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."sla_policies" (
  "sla_policy_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "policy_code" text NOT NULL,
  "policy_name" text NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL
);

CREATE TABLE "synapse"."sla_policy_versions" (
  "sla_policy_version_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "sla_policy_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "policy_version_id" uuid,
  "applies_to_category_id" uuid,
  "applies_to_work_item_type" text,
  "start_event_code" text NOT NULL,
  "duration_minutes" integer NOT NULL,
  "calendar_code" text DEFAULT 'CALENDAR_DAYS'::text NOT NULL,
  "pause_conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "warning_threshold_minutes" integer,
  "escalation_after_minutes" integer,
  "effective_from" timestamp with time zone NOT NULL,
  "effective_until" timestamp with time zone,
  "approved_by_user_id" uuid,
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."submission_case_links" (
  "submission_id" uuid NOT NULL,
  "case_id" uuid NOT NULL,
  "link_type" text NOT NULL,
  "confirmed_by_user_id" uuid,
  "confirmed_at" timestamp with time zone
);

CREATE TABLE "synapse"."submission_translations" (
  "translation_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "submission_id" uuid NOT NULL,
  "source_language_code" text NOT NULL,
  "target_language_code" text NOT NULL,
  "translated_subject" text,
  "translated_body" text,
  "provider_name" text NOT NULL,
  "provider_model_version" text,
  "translation_version" integer NOT NULL,
  "provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_by_user_id" uuid,
  "reviewed_at" timestamp with time zone
);

CREATE TABLE "synapse"."user_bureau_memberships" (
  "membership_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "bureau_id" uuid NOT NULL,
  "membership_type" text DEFAULT 'MEMBER'::text NOT NULL,
  "valid_from" timestamp with time zone DEFAULT now() NOT NULL,
  "valid_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."user_role_assignments" (
  "user_role_assignment_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "role_id" uuid NOT NULL,
  "scope_type" text NOT NULL,
  "bureau_id" uuid,
  "region_id" uuid,
  "valid_from" timestamp with time zone DEFAULT now() NOT NULL,
  "valid_until" timestamp with time zone,
  "assigned_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "synapse"."users" (
  "user_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "external_subject" text,
  "email" text NOT NULL,
  "display_name" text NOT NULL,
  "account_status" text DEFAULT 'ACTIVE'::text NOT NULL,
  "is_global_admin" boolean DEFAULT false NOT NULL,
  "last_login_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE synapse.ai_model_versions ADD CONSTRAINT "ai_model_dates" CHECK (active_until IS NULL OR active_from IS NULL OR active_until > active_from);

ALTER TABLE synapse.ai_model_versions ADD CONSTRAINT "ai_model_hash_format" CHECK (configuration_hash IS NULL OR configuration_hash ~ '^[0-9a-fA-F]{64}$'::text);

ALTER TABLE synapse.ai_model_versions ADD CONSTRAINT "ai_model_version_uq" UNIQUE (capability_code, provider_name, model_name, model_version);

ALTER TABLE synapse.ai_model_versions ADD CONSTRAINT "ai_model_versions_capability_code_check" CHECK (capability_code = ANY (ARRAY['SEMANTIC_MATCH'::text, 'TRANSLATION'::text, 'CLASSIFICATION'::text, 'CONTRADICTION'::text, 'CONFLICT_TRIAGE'::text, 'OTHER'::text]));

ALTER TABLE synapse.ai_model_versions ADD CONSTRAINT "ai_model_versions_pkey" PRIMARY KEY (ai_model_version_id);

ALTER TABLE synapse.audit_events ADD CONSTRAINT "audit_entity_type_nonblank" CHECK (btrim(entity_type) <> ''::text);

ALTER TABLE synapse.audit_events ADD CONSTRAINT "audit_event_type_nonblank" CHECK (btrim(event_type) <> ''::text);

ALTER TABLE synapse.audit_events ADD CONSTRAINT "audit_events_pkey" PRIMARY KEY (audit_event_id);

ALTER TABLE synapse.bureaus ADD CONSTRAINT "bureaus_bureau_code_key" UNIQUE (bureau_code);

ALTER TABLE synapse.bureaus ADD CONSTRAINT "bureaus_code_nonblank" CHECK (btrim(bureau_code) <> ''::text);

ALTER TABLE synapse.bureaus ADD CONSTRAINT "bureaus_name_nonblank" CHECK (btrim(bureau_name) <> ''::text);

ALTER TABLE synapse.bureaus ADD CONSTRAINT "bureaus_not_own_parent" CHECK (parent_bureau_id IS DISTINCT FROM bureau_id);

ALTER TABLE synapse.bureaus ADD CONSTRAINT "bureaus_pkey" PRIMARY KEY (bureau_id);

ALTER TABLE synapse.case_access_grant_approvals ADD CONSTRAINT "access_grant_approval_grant_consistency" CHECK (decision = 'APPROVED'::text AND grant_id IS NOT NULL OR decision = 'REJECTED'::text AND grant_id IS NULL);

ALTER TABLE synapse.case_access_grant_approvals ADD CONSTRAINT "access_grant_approval_reason_nonblank" CHECK (btrim(decision_reason) <> ''::text);

ALTER TABLE synapse.case_access_grant_approvals ADD CONSTRAINT "access_grant_request_decision_uq" UNIQUE (case_access_request_id);

ALTER TABLE synapse.case_access_grant_approvals ADD CONSTRAINT "case_access_grant_approvals_decision_check" CHECK (decision = ANY (ARRAY['APPROVED'::text, 'REJECTED'::text]));

ALTER TABLE synapse.case_access_grant_approvals ADD CONSTRAINT "case_access_grant_approvals_pkey" PRIMARY KEY (case_access_grant_approval_id);

ALTER TABLE synapse.case_access_grants ADD CONSTRAINT "access_grant_revocation" CHECK (revoked_at IS NULL OR revoke_reason IS NOT NULL);

ALTER TABLE synapse.case_access_grants ADD CONSTRAINT "access_grant_subject" CHECK ((user_id IS NOT NULL) <> (bureau_id IS NOT NULL));

ALTER TABLE synapse.case_access_grants ADD CONSTRAINT "access_grant_validity" CHECK (valid_until IS NULL OR valid_until > valid_from);

ALTER TABLE synapse.case_access_grants ADD CONSTRAINT "case_access_grants_granted_scope_check" CHECK (granted_scope = ANY (ARRAY['DISCOVER'::text, 'DETAILS'::text, 'DOCUMENTS'::text, 'COORDINATE'::text, 'EXPORT'::text]));

ALTER TABLE synapse.case_access_grants ADD CONSTRAINT "case_access_grants_pkey" PRIMARY KEY (case_access_grant_id);

ALTER TABLE synapse.case_access_requests ADD CONSTRAINT "access_request_decision_consistency" CHECK ((request_status = ANY (ARRAY['PENDING'::text, 'CANCELLED'::text])) AND decided_at IS NULL AND approver_user_id IS NULL OR (request_status = ANY (ARRAY['APPROVED'::text, 'REJECTED'::text])) AND decided_at IS NOT NULL AND approver_user_id IS NOT NULL OR request_status = 'EXPIRED'::text AND decided_at IS NOT NULL);

ALTER TABLE synapse.case_access_requests ADD CONSTRAINT "access_request_expiry" CHECK (expires_at IS NULL OR expires_at > requested_at);

ALTER TABLE synapse.case_access_requests ADD CONSTRAINT "access_request_reason_nonblank" CHECK (btrim(reason) <> ''::text);

ALTER TABLE synapse.case_access_requests ADD CONSTRAINT "case_access_requests_pkey" PRIMARY KEY (case_access_request_id);

ALTER TABLE synapse.case_access_requests ADD CONSTRAINT "case_access_requests_request_status_check" CHECK (request_status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text, 'CANCELLED'::text, 'EXPIRED'::text]));

ALTER TABLE synapse.case_access_requests ADD CONSTRAINT "case_access_requests_requested_scope_check" CHECK (requested_scope = ANY (ARRAY['DISCOVER'::text, 'DETAILS'::text, 'DOCUMENTS'::text, 'COORDINATE'::text, 'EXPORT'::text]));

ALTER TABLE synapse.case_assignments ADD CONSTRAINT "assignment_validity" CHECK (valid_until IS NULL OR valid_until > valid_from);

ALTER TABLE synapse.case_assignments ADD CONSTRAINT "case_assignments_assignment_role_check" CHECK (assignment_role = ANY (ARRAY['LEAD'::text, 'PARTICIPANT'::text, 'OBSERVER'::text]));

ALTER TABLE synapse.case_assignments ADD CONSTRAINT "case_assignments_pkey" PRIMARY KEY (case_assignment_id);

ALTER TABLE synapse.case_categories ADD CONSTRAINT "case_categories_category_code_key" UNIQUE (category_code);

ALTER TABLE synapse.case_categories ADD CONSTRAINT "case_categories_pkey" PRIMARY KEY (category_id);

ALTER TABLE synapse.case_categories ADD CONSTRAINT "category_code_nonblank" CHECK (btrim(category_code) <> ''::text);

ALTER TABLE synapse.case_categories ADD CONSTRAINT "category_name_nonblank" CHECK (btrim(category_name) <> ''::text);

ALTER TABLE synapse.case_categories ADD CONSTRAINT "category_not_own_parent" CHECK (parent_category_id IS DISTINCT FROM category_id);

ALTER TABLE synapse.case_comments ADD CONSTRAINT "case_comments_pkey" PRIMARY KEY (case_comment_id);

ALTER TABLE synapse.case_comments ADD CONSTRAINT "case_comments_visibility_check" CHECK (visibility = ANY (ARRAY['LEAD_BUREAU_ONLY'::text, 'PARTICIPANTS'::text, 'CASE_AUTHORIZED'::text]));

ALTER TABLE synapse.case_comments ADD CONSTRAINT "comment_nonblank" CHECK (btrim(comment_body) <> ''::text);

ALTER TABLE synapse.case_issue_links ADD CONSTRAINT "case_issue_links_link_status_check" CHECK (link_status = ANY (ARRAY['PROPOSED'::text, 'CONFIRMED'::text, 'REJECTED'::text]));

ALTER TABLE synapse.case_issue_links ADD CONSTRAINT "case_issue_links_pkey" PRIMARY KEY (case_id, issue_id);

ALTER TABLE synapse.case_issue_links ADD CONSTRAINT "issue_link_review_consistency" CHECK (link_status = 'PROPOSED'::text AND reviewed_at IS NULL OR link_status <> 'PROPOSED'::text AND reviewed_at IS NOT NULL);

ALTER TABLE synapse.case_relationship_types ADD CONSTRAINT "case_relationship_types_pkey" PRIMARY KEY (relationship_type);

ALTER TABLE synapse.case_relationships ADD CONSTRAINT "case_relationship_identity_uq" UNIQUE (source_case_id, target_case_id, relationship_type);

ALTER TABLE synapse.case_relationships ADD CONSTRAINT "case_relationships_pkey" PRIMARY KEY (case_relationship_id);

ALTER TABLE synapse.case_relationships ADD CONSTRAINT "case_relationships_relationship_status_check" CHECK (relationship_status = ANY (ARRAY['PROPOSED'::text, 'CONFIRMED'::text, 'REJECTED'::text, 'RETIRED'::text]));

ALTER TABLE synapse.case_relationships ADD CONSTRAINT "relationship_not_self" CHECK (source_case_id <> target_case_id);

ALTER TABLE synapse.case_relationships ADD CONSTRAINT "relationship_review_consistency" CHECK (relationship_status = 'PROPOSED'::text AND reviewed_at IS NULL OR relationship_status <> 'PROPOSED'::text AND reviewed_at IS NOT NULL);

ALTER TABLE synapse.case_status_history ADD CONSTRAINT "case_status_history_pkey" PRIMARY KEY (case_status_history_id);

ALTER TABLE synapse.case_status_history ADD CONSTRAINT "status_change_real" CHECK (from_status_code IS DISTINCT FROM to_status_code);

ALTER TABLE synapse.case_statuses ADD CONSTRAINT "case_status_name_nonblank" CHECK (btrim(display_name) <> ''::text);

ALTER TABLE synapse.case_statuses ADD CONSTRAINT "case_statuses_pkey" PRIMARY KEY (status_code);

ALTER TABLE synapse.case_submissions ADD CONSTRAINT "case_submissions_inbound_message_id_key" UNIQUE (inbound_message_id);

ALTER TABLE synapse.case_submissions ADD CONSTRAINT "case_submissions_pkey" PRIMARY KEY (submission_id);

ALTER TABLE synapse.case_submissions ADD CONSTRAINT "case_submissions_source_type_check" CHECK (source_type = ANY (ARRAY['EMAIL'::text, 'WEB_FORM'::text, 'MANUAL'::text, 'API'::text, 'IMPORT'::text]));

ALTER TABLE synapse.case_submissions ADD CONSTRAINT "case_submissions_submission_status_check" CHECK (submission_status = ANY (ARRAY['DRAFT'::text, 'UNDER_REVIEW'::text, 'ACCEPTED'::text, 'REJECTED'::text, 'LINKED_TO_EXISTING'::text, 'WITHDRAWN'::text]));

ALTER TABLE synapse.case_submissions ADD CONSTRAINT "submission_not_own_duplicate" CHECK (duplicate_of_submission_id IS DISTINCT FROM submission_id);

ALTER TABLE synapse.case_submissions ADD CONSTRAINT "submission_original_content" CHECK (original_subject IS NOT NULL OR original_body IS NOT NULL OR source_reference IS NOT NULL);

ALTER TABLE synapse.case_submissions ADD CONSTRAINT "submission_review_consistency" CHECK ((submission_status = ANY (ARRAY['DRAFT'::text, 'UNDER_REVIEW'::text])) AND reviewed_at IS NULL OR (submission_status <> ALL (ARRAY['DRAFT'::text, 'UNDER_REVIEW'::text])) AND reviewed_at IS NOT NULL);

ALTER TABLE synapse.case_transfer_approvals ADD CONSTRAINT "case_transfer_approvals_approval_side_check" CHECK (approval_side = ANY (ARRAY['SOURCE'::text, 'TARGET'::text]));

ALTER TABLE synapse.case_transfer_approvals ADD CONSTRAINT "case_transfer_approvals_decision_check" CHECK (decision = ANY (ARRAY['APPROVED'::text, 'REJECTED'::text]));

ALTER TABLE synapse.case_transfer_approvals ADD CONSTRAINT "case_transfer_approvals_pkey" PRIMARY KEY (case_transfer_approval_id);

ALTER TABLE synapse.case_transfer_approvals ADD CONSTRAINT "transfer_approval_reason_nonblank" CHECK (btrim(decision_reason) <> ''::text);

ALTER TABLE synapse.case_transfer_approvals ADD CONSTRAINT "transfer_approval_side_uq" UNIQUE (case_transfer_id, approval_side);

ALTER TABLE synapse.case_transfers ADD CONSTRAINT "case_transfers_pkey" PRIMARY KEY (case_transfer_id);

ALTER TABLE synapse.case_transfers ADD CONSTRAINT "case_transfers_transfer_status_check" CHECK (transfer_status = ANY (ARRAY['REQUESTED'::text, 'APPROVED'::text, 'REJECTED'::text, 'COMPLETED'::text, 'CANCELLED'::text]));

ALTER TABLE synapse.case_transfers ADD CONSTRAINT "transfer_bureaus_differ" CHECK (from_bureau_id <> to_bureau_id);

ALTER TABLE synapse.case_transfers ADD CONSTRAINT "transfer_decision_time" CHECK ((transfer_status = ANY (ARRAY['REQUESTED'::text, 'CANCELLED'::text])) AND decided_at IS NULL OR (transfer_status = ANY (ARRAY['APPROVED'::text, 'REJECTED'::text, 'COMPLETED'::text])) AND decided_at IS NOT NULL);

ALTER TABLE synapse.case_transfers ADD CONSTRAINT "transfer_reason_nonblank" CHECK (btrim(reason) <> ''::text);

ALTER TABLE synapse.case_work_items ADD CONSTRAINT "case_work_items_pkey" PRIMARY KEY (work_item_id);

ALTER TABLE synapse.case_work_items ADD CONSTRAINT "case_work_items_status_code_check" CHECK (status_code = ANY (ARRAY['OPEN'::text, 'IN_PROGRESS'::text, 'BLOCKED'::text, 'COMPLETED'::text, 'CANCELLED'::text]));

ALTER TABLE synapse.case_work_items ADD CONSTRAINT "work_item_completion_consistency" CHECK (status_code = 'COMPLETED'::text AND completed_at IS NOT NULL OR status_code <> 'COMPLETED'::text AND completed_at IS NULL);

ALTER TABLE synapse.case_work_items ADD CONSTRAINT "work_item_title_nonblank" CHECK (btrim(title) <> ''::text);

ALTER TABLE synapse.cases ADD CONSTRAINT "case_campus_institution_fk" UNIQUE (case_id, institution_id);

ALTER TABLE synapse.cases ADD CONSTRAINT "case_disposition_consistency" CHECK (current_status_code = 'DISPOSED'::text AND disposed_at IS NOT NULL OR current_status_code <> 'DISPOSED'::text AND disposed_at IS NULL);

ALTER TABLE synapse.cases ADD CONSTRAINT "case_title_nonblank" CHECK (btrim(title) <> ''::text);

ALTER TABLE synapse.cases ADD CONSTRAINT "cases_case_number_key" UNIQUE (case_number);

ALTER TABLE synapse.cases ADD CONSTRAINT "cases_confidentiality_level_check" CHECK (confidentiality_level = ANY (ARRAY['INTERNAL'::text, 'RESTRICTED'::text, 'HIGHLY_RESTRICTED'::text]));

ALTER TABLE synapse.cases ADD CONSTRAINT "cases_pkey" PRIMARY KEY (case_id);

ALTER TABLE synapse.cases ADD CONSTRAINT "cases_priority_code_check" CHECK (priority_code = ANY (ARRAY['LOW'::text, 'NORMAL'::text, 'HIGH'::text, 'URGENT'::text]));

ALTER TABLE synapse.claim_source_references ADD CONSTRAINT "claim_source_location_present" CHECK (page_number IS NOT NULL OR character_start IS NOT NULL OR quoted_text IS NOT NULL);

ALTER TABLE synapse.claim_source_references ADD CONSTRAINT "claim_source_references_character_start_check" CHECK (character_start IS NULL OR character_start >= 0);

ALTER TABLE synapse.claim_source_references ADD CONSTRAINT "claim_source_references_check" CHECK (character_end IS NULL OR character_end >= character_start);

ALTER TABLE synapse.claim_source_references ADD CONSTRAINT "claim_source_references_page_number_check" CHECK (page_number IS NULL OR page_number > 0);

ALTER TABLE synapse.claim_source_references ADD CONSTRAINT "claim_source_references_paragraph_number_check" CHECK (paragraph_number IS NULL OR paragraph_number > 0);

ALTER TABLE synapse.claim_source_references ADD CONSTRAINT "claim_source_references_pkey" PRIMARY KEY (claim_source_reference_id);

ALTER TABLE synapse.closure_approvals ADD CONSTRAINT "closure_approval_reason_nonblank" CHECK (btrim(decision_reason) <> ''::text);

ALTER TABLE synapse.closure_approvals ADD CONSTRAINT "closure_approvals_decision_check" CHECK (decision = ANY (ARRAY['APPROVED'::text, 'REJECTED'::text, 'RETURNED'::text]));

ALTER TABLE synapse.closure_approvals ADD CONSTRAINT "closure_approvals_pkey" PRIMARY KEY (closure_approval_id);

ALTER TABLE synapse.closure_checklist_versions ADD CONSTRAINT "closure_checklist_effective_dates" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE synapse.closure_checklist_versions ADD CONSTRAINT "closure_checklist_version_uq" UNIQUE (closure_checklist_id, version_number);

ALTER TABLE synapse.closure_checklist_versions ADD CONSTRAINT "closure_checklist_versions_pkey" PRIMARY KEY (closure_checklist_version_id);

ALTER TABLE synapse.closure_checklist_versions ADD CONSTRAINT "closure_checklist_versions_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'APPROVED'::text, 'RETIRED'::text]));

ALTER TABLE synapse.closure_checklist_versions ADD CONSTRAINT "closure_checklist_versions_version_number_check" CHECK (version_number > 0);

ALTER TABLE synapse.closure_checklists ADD CONSTRAINT "closure_checklists_checklist_code_key" UNIQUE (checklist_code);

ALTER TABLE synapse.closure_checklists ADD CONSTRAINT "closure_checklists_pkey" PRIMARY KEY (closure_checklist_id);

ALTER TABLE synapse.closure_evaluation_items ADD CONSTRAINT "closure_evaluation_items_pkey" PRIMARY KEY (closure_evaluation_id, closure_requirement_id);

ALTER TABLE synapse.closure_evaluation_items ADD CONSTRAINT "closure_evaluation_items_result_code_check" CHECK (result_code = ANY (ARRAY['SATISFIED'::text, 'UNSATISFIED'::text, 'WARNING'::text, 'NOT_APPLICABLE'::text]));

ALTER TABLE synapse.closure_evaluations ADD CONSTRAINT "closure_evaluations_evaluation_status_check" CHECK (evaluation_status = ANY (ARRAY['PASS'::text, 'WARNING'::text, 'BLOCKED'::text]));

ALTER TABLE synapse.closure_evaluations ADD CONSTRAINT "closure_evaluations_pkey" PRIMARY KEY (closure_evaluation_id);

ALTER TABLE synapse.closure_exceptions ADD CONSTRAINT "closure_exception_decision_consistency" CHECK (exception_status = 'REQUESTED'::text AND decided_at IS NULL OR exception_status <> 'REQUESTED'::text AND decided_at IS NOT NULL AND approved_by_user_id IS NOT NULL);

ALTER TABLE synapse.closure_exceptions ADD CONSTRAINT "closure_exception_reason_nonblank" CHECK (btrim(reason) <> ''::text);

ALTER TABLE synapse.closure_exceptions ADD CONSTRAINT "closure_exceptions_exception_status_check" CHECK (exception_status = ANY (ARRAY['REQUESTED'::text, 'APPROVED'::text, 'REJECTED'::text, 'REVOKED'::text]));

ALTER TABLE synapse.closure_exceptions ADD CONSTRAINT "closure_exceptions_pkey" PRIMARY KEY (closure_exception_id);

ALTER TABLE synapse.closure_requirements ADD CONSTRAINT "closure_requirement_code_uq" UNIQUE (closure_checklist_version_id, requirement_code);

ALTER TABLE synapse.closure_requirements ADD CONSTRAINT "closure_requirements_pkey" PRIMARY KEY (closure_requirement_id);

ALTER TABLE synapse.closure_requirements ADD CONSTRAINT "closure_requirements_requirement_type_check" CHECK (requirement_type = ANY (ARRAY['EVIDENCE'::text, 'ACTION'::text, 'APPROVAL'::text, 'RESPONSE'::text, 'DEPENDENCY'::text, 'OTHER'::text]));

ALTER TABLE synapse.conflict_finding_actions ADD CONSTRAINT "conflict_finding_actions_pkey" PRIMARY KEY (conflict_finding_id, regulatory_action_id);

ALTER TABLE synapse.conflict_finding_actions ADD CONSTRAINT "conflict_finding_actions_relation_to_finding_check" CHECK (relation_to_finding = ANY (ARRAY['PRIMARY'::text, 'RELATED'::text, 'POTENTIAL_CONFLICT'::text]));

ALTER TABLE synapse.conflict_findings ADD CONSTRAINT "conflict_findings_confidence_check" CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric);

ALTER TABLE synapse.conflict_findings ADD CONSTRAINT "conflict_findings_finding_status_check" CHECK (finding_status = ANY (ARRAY['DETECTED'::text, 'UNDER_REVIEW'::text, 'CONFIRMED'::text, 'DISMISSED'::text, 'RESOLVED'::text]));

ALTER TABLE synapse.conflict_findings ADD CONSTRAINT "conflict_findings_pkey" PRIMARY KEY (conflict_finding_id);

ALTER TABLE synapse.conflict_findings ADD CONSTRAINT "conflict_findings_severity_code_check" CHECK (severity_code = ANY (ARRAY['INFO'::text, 'LOW'::text, 'MEDIUM'::text, 'HIGH'::text, 'CRITICAL'::text]));

ALTER TABLE synapse.conflict_findings ADD CONSTRAINT "conflict_review_consistency" CHECK ((finding_status = ANY (ARRAY['DETECTED'::text, 'UNDER_REVIEW'::text])) AND reviewed_at IS NULL OR (finding_status = ANY (ARRAY['CONFIRMED'::text, 'DISMISSED'::text, 'RESOLVED'::text])) AND reviewed_at IS NOT NULL);

ALTER TABLE synapse.conflict_rule_action_links ADD CONSTRAINT "conflict_rule_action_links_pkey" PRIMARY KEY (conflict_rule_id, regulatory_action_id);

ALTER TABLE synapse.conflict_rules ADD CONSTRAINT "conflict_rule_version_uq" UNIQUE (rule_code, version_number);

ALTER TABLE synapse.conflict_rules ADD CONSTRAINT "conflict_rules_pkey" PRIMARY KEY (conflict_rule_id);

ALTER TABLE synapse.conflict_rules ADD CONSTRAINT "conflict_rules_rule_code_key" UNIQUE (rule_code);

ALTER TABLE synapse.conflict_rules ADD CONSTRAINT "conflict_rules_severity_code_check" CHECK (severity_code = ANY (ARRAY['INFO'::text, 'LOW'::text, 'MEDIUM'::text, 'HIGH'::text, 'CRITICAL'::text]));

ALTER TABLE synapse.conflict_rules ADD CONSTRAINT "conflict_rules_version_number_check" CHECK (version_number > 0);

ALTER TABLE synapse.contradiction_findings ADD CONSTRAINT "contradiction_claims_differ" CHECK (claim_a_id <> claim_b_id);

ALTER TABLE synapse.contradiction_findings ADD CONSTRAINT "contradiction_findings_confidence_check" CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric);

ALTER TABLE synapse.contradiction_findings ADD CONSTRAINT "contradiction_findings_contradiction_type_check" CHECK (contradiction_type = ANY (ARRAY['DIRECT'::text, 'TEMPORAL'::text, 'ENTITY_MISMATCH'::text, 'SCOPE_MISMATCH'::text, 'OTHER'::text]));

ALTER TABLE synapse.contradiction_findings ADD CONSTRAINT "contradiction_findings_finding_status_check" CHECK (finding_status = ANY (ARRAY['DETECTED'::text, 'UNDER_REVIEW'::text, 'CONFIRMED'::text, 'DISMISSED'::text, 'INCONCLUSIVE'::text, 'RESOLVED'::text]));

ALTER TABLE synapse.contradiction_findings ADD CONSTRAINT "contradiction_findings_pkey" PRIMARY KEY (contradiction_finding_id);

ALTER TABLE synapse.contradiction_findings ADD CONSTRAINT "contradiction_model_provenance" CHECK (model_name IS NULL OR model_version IS NOT NULL);

ALTER TABLE synapse.contradiction_findings ADD CONSTRAINT "contradiction_pair_uq" UNIQUE (claim_a_id, claim_b_id, contradiction_type);

ALTER TABLE synapse.contradiction_findings ADD CONSTRAINT "contradiction_review_consistency" CHECK ((finding_status = ANY (ARRAY['DETECTED'::text, 'UNDER_REVIEW'::text])) AND reviewed_at IS NULL OR (finding_status = ANY (ARRAY['CONFIRMED'::text, 'DISMISSED'::text, 'INCONCLUSIVE'::text, 'RESOLVED'::text])) AND reviewed_at IS NOT NULL);

ALTER TABLE synapse.document_extractions ADD CONSTRAINT "document_extractions_confidence_check" CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric);

ALTER TABLE synapse.document_extractions ADD CONSTRAINT "document_extractions_extraction_status_check" CHECK (extraction_status = ANY (ARRAY['QUEUED'::text, 'RUNNING'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'REVIEW_REQUIRED'::text]));

ALTER TABLE synapse.document_extractions ADD CONSTRAINT "document_extractions_pkey" PRIMARY KEY (document_extraction_id);

ALTER TABLE synapse.document_versions ADD CONSTRAINT "document_sha256_format" CHECK (sha256_hex ~ '^[0-9a-fA-F]{64}$'::text);

ALTER TABLE synapse.document_versions ADD CONSTRAINT "document_version_uq" UNIQUE (document_id, version_number);

ALTER TABLE synapse.document_versions ADD CONSTRAINT "document_versions_byte_size_check" CHECK (byte_size >= 0);

ALTER TABLE synapse.document_versions ADD CONSTRAINT "document_versions_malware_scan_status_check" CHECK (malware_scan_status = ANY (ARRAY['PENDING'::text, 'CLEAN'::text, 'INFECTED'::text, 'ERROR'::text, 'NOT_REQUIRED'::text]));

ALTER TABLE synapse.document_versions ADD CONSTRAINT "document_versions_pkey" PRIMARY KEY (document_version_id);

ALTER TABLE synapse.document_versions ADD CONSTRAINT "document_versions_storage_key_key" UNIQUE (storage_key);

ALTER TABLE synapse.document_versions ADD CONSTRAINT "document_versions_version_number_check" CHECK (version_number > 0);

ALTER TABLE synapse.documents ADD CONSTRAINT "document_has_owner" CHECK (owner_case_id IS NOT NULL OR owner_submission_id IS NOT NULL);

ALTER TABLE synapse.documents ADD CONSTRAINT "documents_confidentiality_level_check" CHECK (confidentiality_level = ANY (ARRAY['INTERNAL'::text, 'RESTRICTED'::text, 'HIGHLY_RESTRICTED'::text]));

ALTER TABLE synapse.documents ADD CONSTRAINT "documents_pkey" PRIMARY KEY (document_id);

ALTER TABLE synapse.evidence_claims ADD CONSTRAINT "claim_dates" CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from);

ALTER TABLE synapse.evidence_claims ADD CONSTRAINT "claim_model_provenance" CHECK (claim_extraction_method <> 'MODEL'::text OR model_name IS NOT NULL AND model_version IS NOT NULL);

ALTER TABLE synapse.evidence_claims ADD CONSTRAINT "claim_text_nonblank" CHECK (btrim(claim_text) <> ''::text);

ALTER TABLE synapse.evidence_claims ADD CONSTRAINT "evidence_claims_claim_extraction_method_check" CHECK (claim_extraction_method = ANY (ARRAY['HUMAN'::text, 'RULE'::text, 'MODEL'::text]));

ALTER TABLE synapse.evidence_claims ADD CONSTRAINT "evidence_claims_confidence_check" CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric);

ALTER TABLE synapse.evidence_claims ADD CONSTRAINT "evidence_claims_pkey" PRIMARY KEY (evidence_claim_id);

ALTER TABLE synapse.evidence_items ADD CONSTRAINT "evidence_has_context" CHECK (case_id IS NOT NULL OR regulatory_action_id IS NOT NULL);

ALTER TABLE synapse.evidence_items ADD CONSTRAINT "evidence_items_evidence_status_check" CHECK (evidence_status = ANY (ARRAY['SUBMITTED'::text, 'VERIFIED'::text, 'DISPUTED'::text, 'SUPERSEDED'::text, 'WITHDRAWN'::text]));

ALTER TABLE synapse.evidence_items ADD CONSTRAINT "evidence_items_pkey" PRIMARY KEY (evidence_item_id);

ALTER TABLE synapse.evidence_items ADD CONSTRAINT "evidence_verification_consistency" CHECK (evidence_status <> 'VERIFIED'::text OR verified_by_user_id IS NOT NULL AND verified_at IS NOT NULL);

ALTER TABLE synapse.inbound_messages ADD CONSTRAINT "inbound_external_id_uq" UNIQUE (integration_source_id, external_message_id);

ALTER TABLE synapse.inbound_messages ADD CONSTRAINT "inbound_fingerprint_nonblank" CHECK (btrim(normalized_fingerprint) <> ''::text);

ALTER TABLE synapse.inbound_messages ADD CONSTRAINT "inbound_messages_message_status_check" CHECK (message_status = ANY (ARRAY['RECEIVED'::text, 'PROCESSING'::text, 'PROCESSED'::text, 'RETRY_PENDING'::text, 'FAILED'::text, 'QUARANTINED'::text]));

ALTER TABLE synapse.inbound_messages ADD CONSTRAINT "inbound_messages_pkey" PRIMARY KEY (inbound_message_id);

ALTER TABLE synapse.institution_aliases ADD CONSTRAINT "institution_alias_nonblank" CHECK (btrim(alias_name) <> ''::text);

ALTER TABLE synapse.institution_aliases ADD CONSTRAINT "institution_alias_validity" CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from);

ALTER TABLE synapse.institution_aliases ADD CONSTRAINT "institution_aliases_alias_type_check" CHECK (alias_type = ANY (ARRAY['ALTERNATE'::text, 'FORMER'::text, 'ABBREVIATION'::text, 'SPELLING_VARIANT'::text]));

ALTER TABLE synapse.institution_aliases ADD CONSTRAINT "institution_aliases_pkey" PRIMARY KEY (institution_alias_id);

ALTER TABLE synapse.institution_campuses ADD CONSTRAINT "campus_code_uq" UNIQUE (institution_id, campus_code);

ALTER TABLE synapse.institution_campuses ADD CONSTRAINT "campus_identity_uq" UNIQUE (campus_id, institution_id);

ALTER TABLE synapse.institution_campuses ADD CONSTRAINT "campus_name_nonblank" CHECK (btrim(campus_name) <> ''::text);

ALTER TABLE synapse.institution_campuses ADD CONSTRAINT "institution_campuses_pkey" PRIMARY KEY (campus_id);

ALTER TABLE synapse.institution_identifiers ADD CONSTRAINT "institution_identifier_nonblank" CHECK (btrim(identifier_type) <> ''::text AND btrim(identifier_value) <> ''::text);

ALTER TABLE synapse.institution_identifiers ADD CONSTRAINT "institution_identifier_uq" UNIQUE (issuing_authority, identifier_type, identifier_value);

ALTER TABLE synapse.institution_identifiers ADD CONSTRAINT "institution_identifier_validity" CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from);

ALTER TABLE synapse.institution_identifiers ADD CONSTRAINT "institution_identifiers_pkey" PRIMARY KEY (institution_identifier_id);

ALTER TABLE synapse.institutions ADD CONSTRAINT "institution_name_nonblank" CHECK (btrim(canonical_name) <> ''::text);

ALTER TABLE synapse.institutions ADD CONSTRAINT "institution_source_pair" CHECK ((source_system IS NULL) = (source_record_id IS NULL));

ALTER TABLE synapse.institutions ADD CONSTRAINT "institution_source_uq" UNIQUE (source_system, source_record_id);

ALTER TABLE synapse.institutions ADD CONSTRAINT "institutions_institution_status_check" CHECK (institution_status = ANY (ARRAY['ACTIVE'::text, 'SUSPENDED'::text, 'CLOSED'::text, 'MERGED'::text, 'UNKNOWN'::text]));

ALTER TABLE synapse.institutions ADD CONSTRAINT "institutions_pkey" PRIMARY KEY (institution_id);

ALTER TABLE synapse.integration_events ADD CONSTRAINT "integration_events_attempt_count_check" CHECK (attempt_count >= 0);

ALTER TABLE synapse.integration_events ADD CONSTRAINT "integration_events_event_status_check" CHECK (event_status = ANY (ARRAY['RECEIVED'::text, 'PROCESSING'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'RETRY_PENDING'::text, 'QUARANTINED'::text]));

ALTER TABLE synapse.integration_events ADD CONSTRAINT "integration_events_pkey" PRIMARY KEY (integration_event_id);

ALTER TABLE synapse.integration_events ADD CONSTRAINT "integration_external_event_uq" UNIQUE (integration_source_id, external_event_id);

ALTER TABLE synapse.integration_events ADD CONSTRAINT "integration_payload_hash" CHECK (payload_hash ~ '^[0-9a-fA-F]{64}$'::text);

ALTER TABLE synapse.integration_reconciliation_runs ADD CONSTRAINT "integration_reconciliation_runs_discrepancies_found_check" CHECK (discrepancies_found >= 0);

ALTER TABLE synapse.integration_reconciliation_runs ADD CONSTRAINT "integration_reconciliation_runs_pkey" PRIMARY KEY (reconciliation_run_id);

ALTER TABLE synapse.integration_reconciliation_runs ADD CONSTRAINT "integration_reconciliation_runs_records_examined_check" CHECK (records_examined >= 0);

ALTER TABLE synapse.integration_reconciliation_runs ADD CONSTRAINT "integration_reconciliation_runs_run_status_check" CHECK (run_status = ANY (ARRAY['RUNNING'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'PARTIAL'::text]));

ALTER TABLE synapse.integration_reconciliation_runs ADD CONSTRAINT "reconciliation_time" CHECK (completed_at IS NULL OR completed_at >= started_at);

ALTER TABLE synapse.integration_sources ADD CONSTRAINT "integration_source_name_nonblank" CHECK (btrim(source_name) <> ''::text);

ALTER TABLE synapse.integration_sources ADD CONSTRAINT "integration_sources_pkey" PRIMARY KEY (integration_source_id);

ALTER TABLE synapse.integration_sources ADD CONSTRAINT "integration_sources_source_code_key" UNIQUE (source_code);

ALTER TABLE synapse.integration_sources ADD CONSTRAINT "integration_sources_source_type_check" CHECK (source_type = ANY (ARRAY['EMAIL_INBOX'::text, 'REST_API'::text, 'FILE_IMPORT'::text, 'MANUAL'::text]));

ALTER TABLE synapse.issues ADD CONSTRAINT "issue_title_nonblank" CHECK (btrim(issue_title) <> ''::text);

ALTER TABLE synapse.issues ADD CONSTRAINT "issues_issue_status_check" CHECK (issue_status = ANY (ARRAY['OPEN'::text, 'MONITORING'::text, 'RESOLVED'::text, 'CLOSED'::text]));

ALTER TABLE synapse.issues ADD CONSTRAINT "issues_pkey" PRIMARY KEY (issue_id);

ALTER TABLE synapse.match_candidates ADD CONSTRAINT "match_candidate_review_consistency" CHECK (review_status = 'PENDING'::text AND reviewed_at IS NULL OR review_status <> 'PENDING'::text AND reviewed_at IS NOT NULL);

ALTER TABLE synapse.match_candidates ADD CONSTRAINT "match_candidate_subject" CHECK ((candidate_case_id IS NOT NULL) <> (candidate_submission_id IS NOT NULL));

ALTER TABLE synapse.match_candidates ADD CONSTRAINT "match_candidates_match_classification_check" CHECK (match_classification = ANY (ARRAY['LIKELY_DUPLICATE'::text, 'RELATED_CASE'::text, 'SEPARATE_CASE'::text, 'UNCERTAIN'::text]));

ALTER TABLE synapse.match_candidates ADD CONSTRAINT "match_candidates_overall_score_check" CHECK (overall_score IS NULL OR overall_score >= 0::numeric AND overall_score <= 1::numeric);

ALTER TABLE synapse.match_candidates ADD CONSTRAINT "match_candidates_pkey" PRIMARY KEY (match_candidate_id);

ALTER TABLE synapse.match_candidates ADD CONSTRAINT "match_candidates_review_status_check" CHECK (review_status = ANY (ARRAY['PENDING'::text, 'CONFIRMED'::text, 'REJECTED'::text, 'DEFERRED'::text]));

ALTER TABLE synapse.match_runs ADD CONSTRAINT "match_runs_pkey" PRIMARY KEY (match_run_id);

ALTER TABLE synapse.match_runs ADD CONSTRAINT "match_runs_run_stage_check" CHECK (run_stage = ANY (ARRAY['EXACT'::text, 'RULE_FILTER'::text, 'TEXT_SIMILARITY'::text, 'EMBEDDING'::text, 'FINAL_CLASSIFICATION'::text]));

ALTER TABLE synapse.match_runs ADD CONSTRAINT "match_runs_run_status_check" CHECK (run_status = ANY (ARRAY['QUEUED'::text, 'RUNNING'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'SKIPPED'::text]));

ALTER TABLE synapse.notification_deliveries ADD CONSTRAINT "notification_deliveries_attempt_number_check" CHECK (attempt_number > 0);

ALTER TABLE synapse.notification_deliveries ADD CONSTRAINT "notification_deliveries_channel_check" CHECK (channel = ANY (ARRAY['IN_APP'::text, 'EMAIL'::text, 'SMS'::text, 'WEBHOOK'::text]));

ALTER TABLE synapse.notification_deliveries ADD CONSTRAINT "notification_deliveries_delivery_status_check" CHECK (delivery_status = ANY (ARRAY['QUEUED'::text, 'SENDING'::text, 'SENT'::text, 'FAILED'::text, 'CANCELLED'::text]));

ALTER TABLE synapse.notification_deliveries ADD CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY (notification_delivery_id);

ALTER TABLE synapse.notification_deliveries ADD CONSTRAINT "notification_delivery_attempt_uq" UNIQUE (notification_id, channel, attempt_number);

ALTER TABLE synapse.notifications ADD CONSTRAINT "notification_subject_nonblank" CHECK (btrim(subject) <> ''::text);

ALTER TABLE synapse.notifications ADD CONSTRAINT "notifications_pkey" PRIMARY KEY (notification_id);

ALTER TABLE synapse.permissions ADD CONSTRAINT "permissions_code_nonblank" CHECK (btrim(permission_code) <> ''::text);

ALTER TABLE synapse.permissions ADD CONSTRAINT "permissions_permission_code_key" UNIQUE (permission_code);

ALTER TABLE synapse.permissions ADD CONSTRAINT "permissions_pkey" PRIMARY KEY (permission_id);

ALTER TABLE synapse.policy_sources ADD CONSTRAINT "policy_source_title_nonblank" CHECK (btrim(title) <> ''::text);

ALTER TABLE synapse.policy_sources ADD CONSTRAINT "policy_sources_pkey" PRIMARY KEY (policy_source_id);

ALTER TABLE synapse.policy_sources ADD CONSTRAINT "policy_sources_source_code_key" UNIQUE (source_code);

ALTER TABLE synapse.policy_sources ADD CONSTRAINT "policy_sources_source_type_check" CHECK (source_type = ANY (ARRAY['REGULATION'::text, 'CIRCULAR'::text, 'SOP'::text, 'INTERNAL_POLICY'::text, 'OTHER'::text]));

ALTER TABLE synapse.policy_versions ADD CONSTRAINT "policy_version_dates" CHECK (effective_until IS NULL OR effective_until >= effective_from);

ALTER TABLE synapse.policy_versions ADD CONSTRAINT "policy_version_hash_format" CHECK (content_hash IS NULL OR content_hash ~ '^[0-9a-fA-F]{64}$'::text);

ALTER TABLE synapse.policy_versions ADD CONSTRAINT "policy_version_label_uq" UNIQUE (policy_source_id, version_label);

ALTER TABLE synapse.policy_versions ADD CONSTRAINT "policy_versions_pkey" PRIMARY KEY (policy_version_id);

ALTER TABLE synapse.policy_versions ADD CONSTRAINT "policy_versions_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'APPROVED'::text, 'RETIRED'::text]));

ALTER TABLE synapse.regions ADD CONSTRAINT "regions_code_nonblank" CHECK (btrim(region_code) <> ''::text);

ALTER TABLE synapse.regions ADD CONSTRAINT "regions_name_nonblank" CHECK (btrim(region_name) <> ''::text);

ALTER TABLE synapse.regions ADD CONSTRAINT "regions_pkey" PRIMARY KEY (region_id);

ALTER TABLE synapse.regions ADD CONSTRAINT "regions_region_code_key" UNIQUE (region_code);

ALTER TABLE synapse.regulatory_action_participants ADD CONSTRAINT "regulatory_action_participants_participant_role_check" CHECK (participant_role = ANY (ARRAY['LEAD'::text, 'PARTICIPANT'::text, 'CONSULTED'::text, 'INFORMED'::text]));

ALTER TABLE synapse.regulatory_action_participants ADD CONSTRAINT "regulatory_action_participants_pkey" PRIMARY KEY (regulatory_action_id, bureau_id);

ALTER TABLE synapse.regulatory_actions ADD CONSTRAINT "actual_action_dates" CHECK (actual_end_at IS NULL OR actual_start_at IS NULL OR actual_end_at >= actual_start_at);

ALTER TABLE synapse.regulatory_actions ADD CONSTRAINT "planned_action_dates" CHECK (planned_end_at IS NULL OR planned_start_at IS NULL OR planned_end_at >= planned_start_at);

ALTER TABLE synapse.regulatory_actions ADD CONSTRAINT "regulatory_action_title_nonblank" CHECK (btrim(action_title) <> ''::text);

ALTER TABLE synapse.regulatory_actions ADD CONSTRAINT "regulatory_actions_action_status_check" CHECK (action_status = ANY (ARRAY['PROPOSED'::text, 'PLANNED'::text, 'ACTIVE'::text, 'ON_HOLD'::text, 'COMPLETED'::text, 'CANCELLED'::text]));

ALTER TABLE synapse.regulatory_actions ADD CONSTRAINT "regulatory_actions_pkey" PRIMARY KEY (regulatory_action_id);

ALTER TABLE synapse.retention_actions ADD CONSTRAINT "retention_action_reason_nonblank" CHECK (btrim(reason) <> ''::text);

ALTER TABLE synapse.retention_actions ADD CONSTRAINT "retention_actions_action_code_check" CHECK (action_code = ANY (ARRAY['ARCHIVED'::text, 'ANONYMIZED'::text, 'DELETED'::text, 'SKIPPED'::text, 'LEGAL_HOLD'::text]));

ALTER TABLE synapse.retention_actions ADD CONSTRAINT "retention_actions_pkey" PRIMARY KEY (retention_action_id);

ALTER TABLE synapse.retention_policies ADD CONSTRAINT "retention_policies_action_code_check" CHECK (action_code = ANY (ARRAY['RETAIN'::text, 'ARCHIVE'::text, 'ANONYMIZE'::text, 'DELETE_AFTER_APPROVAL'::text]));

ALTER TABLE synapse.retention_policies ADD CONSTRAINT "retention_policies_pkey" PRIMARY KEY (retention_policy_id);

ALTER TABLE synapse.retention_policies ADD CONSTRAINT "retention_policies_policy_code_key" UNIQUE (policy_code);

ALTER TABLE synapse.retention_policies ADD CONSTRAINT "retention_policies_retention_days_check" CHECK (retention_days IS NULL OR retention_days > 0);

ALTER TABLE synapse.role_permissions ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY (role_id, permission_id);

ALTER TABLE synapse.roles ADD CONSTRAINT "roles_code_nonblank" CHECK (btrim(role_code) <> ''::text);

ALTER TABLE synapse.roles ADD CONSTRAINT "roles_pkey" PRIMARY KEY (role_id);

ALTER TABLE synapse.roles ADD CONSTRAINT "roles_role_code_key" UNIQUE (role_code);

ALTER TABLE synapse.sla_events ADD CONSTRAINT "sla_events_event_type_check" CHECK (event_type = ANY (ARRAY['STARTED'::text, 'PAUSED'::text, 'RESUMED'::text, 'DUE_DATE_CHANGED'::text, 'MET'::text, 'BREACHED'::text, 'CANCELLED'::text]));

ALTER TABLE synapse.sla_events ADD CONSTRAINT "sla_events_pkey" PRIMARY KEY (sla_event_id);

ALTER TABLE synapse.sla_instances ADD CONSTRAINT "sla_completion_consistency" CHECK (sla_status = 'MET'::text AND completed_at IS NOT NULL OR sla_status <> 'MET'::text AND completed_at IS NULL);

ALTER TABLE synapse.sla_instances ADD CONSTRAINT "sla_due_dates" CHECK (current_due_at >= started_at AND original_due_at >= started_at);

ALTER TABLE synapse.sla_instances ADD CONSTRAINT "sla_has_subject" CHECK ((case_id IS NOT NULL) <> (work_item_id IS NOT NULL));

ALTER TABLE synapse.sla_instances ADD CONSTRAINT "sla_instances_cycle_number_check" CHECK (cycle_number > 0);

ALTER TABLE synapse.sla_instances ADD CONSTRAINT "sla_instances_pkey" PRIMARY KEY (sla_instance_id);

ALTER TABLE synapse.sla_instances ADD CONSTRAINT "sla_instances_sla_status_check" CHECK (sla_status = ANY (ARRAY['RUNNING'::text, 'PAUSED'::text, 'MET'::text, 'BREACHED'::text, 'CANCELLED'::text]));

ALTER TABLE synapse.sla_policies ADD CONSTRAINT "sla_policies_pkey" PRIMARY KEY (sla_policy_id);

ALTER TABLE synapse.sla_policies ADD CONSTRAINT "sla_policies_policy_code_key" UNIQUE (policy_code);

ALTER TABLE synapse.sla_policy_versions ADD CONSTRAINT "sla_policy_effective_dates" CHECK (effective_until IS NULL OR effective_until > effective_from);

ALTER TABLE synapse.sla_policy_versions ADD CONSTRAINT "sla_policy_version_uq" UNIQUE (sla_policy_id, version_number);

ALTER TABLE synapse.sla_policy_versions ADD CONSTRAINT "sla_policy_versions_duration_minutes_check" CHECK (duration_minutes > 0);

ALTER TABLE synapse.sla_policy_versions ADD CONSTRAINT "sla_policy_versions_escalation_after_minutes_check" CHECK (escalation_after_minutes IS NULL OR escalation_after_minutes >= 0);

ALTER TABLE synapse.sla_policy_versions ADD CONSTRAINT "sla_policy_versions_pkey" PRIMARY KEY (sla_policy_version_id);

ALTER TABLE synapse.sla_policy_versions ADD CONSTRAINT "sla_policy_versions_version_number_check" CHECK (version_number > 0);

ALTER TABLE synapse.sla_policy_versions ADD CONSTRAINT "sla_policy_versions_warning_threshold_minutes_check" CHECK (warning_threshold_minutes IS NULL OR warning_threshold_minutes >= 0);

ALTER TABLE synapse.submission_case_links ADD CONSTRAINT "submission_case_confirm_consistency" CHECK (confirmed_by_user_id IS NULL AND confirmed_at IS NULL OR confirmed_by_user_id IS NOT NULL AND confirmed_at IS NOT NULL);

ALTER TABLE synapse.submission_case_links ADD CONSTRAINT "submission_case_links_link_type_check" CHECK (link_type = ANY (ARRAY['CREATED'::text, 'EVIDENCE_FOR'::text, 'DUPLICATE_OF'::text, 'RELATED_TO'::text]));

ALTER TABLE synapse.submission_case_links ADD CONSTRAINT "submission_case_links_pkey" PRIMARY KEY (submission_id, case_id, link_type);

ALTER TABLE synapse.submission_translations ADD CONSTRAINT "submission_translations_pkey" PRIMARY KEY (translation_id);

ALTER TABLE synapse.submission_translations ADD CONSTRAINT "submission_translations_translation_version_check" CHECK (translation_version > 0);

ALTER TABLE synapse.submission_translations ADD CONSTRAINT "translation_content_present" CHECK (translated_subject IS NOT NULL OR translated_body IS NOT NULL);

ALTER TABLE synapse.submission_translations ADD CONSTRAINT "translation_languages_differ" CHECK (source_language_code <> target_language_code);

ALTER TABLE synapse.submission_translations ADD CONSTRAINT "translation_version_uq" UNIQUE (submission_id, source_language_code, target_language_code, translation_version);

ALTER TABLE synapse.user_bureau_memberships ADD CONSTRAINT "membership_validity" CHECK (valid_until IS NULL OR valid_until > valid_from);

ALTER TABLE synapse.user_bureau_memberships ADD CONSTRAINT "user_bureau_memberships_membership_type_check" CHECK (membership_type = ANY (ARRAY['MEMBER'::text, 'LEAD'::text, 'APPROVER'::text, 'READ_ONLY'::text]));

ALTER TABLE synapse.user_bureau_memberships ADD CONSTRAINT "user_bureau_memberships_pkey" PRIMARY KEY (membership_id);

ALTER TABLE synapse.user_role_assignments ADD CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY (user_role_assignment_id);

ALTER TABLE synapse.user_role_assignments ADD CONSTRAINT "user_role_assignments_scope_type_check" CHECK (scope_type = ANY (ARRAY['GLOBAL'::text, 'BUREAU'::text, 'REGION'::text]));

ALTER TABLE synapse.user_role_assignments ADD CONSTRAINT "user_role_scope_consistency" CHECK (scope_type = 'GLOBAL'::text AND bureau_id IS NULL AND region_id IS NULL OR scope_type = 'BUREAU'::text AND bureau_id IS NOT NULL AND region_id IS NULL OR scope_type = 'REGION'::text AND region_id IS NOT NULL AND bureau_id IS NULL);

ALTER TABLE synapse.user_role_assignments ADD CONSTRAINT "user_role_validity" CHECK (valid_until IS NULL OR valid_until > valid_from);

ALTER TABLE synapse.users ADD CONSTRAINT "users_account_status_check" CHECK (account_status = ANY (ARRAY['INVITED'::text, 'ACTIVE'::text, 'SUSPENDED'::text, 'DISABLED'::text]));

ALTER TABLE synapse.users ADD CONSTRAINT "users_email_nonblank" CHECK (btrim(email) <> ''::text);

ALTER TABLE synapse.users ADD CONSTRAINT "users_external_subject_key" UNIQUE (external_subject);

ALTER TABLE synapse.users ADD CONSTRAINT "users_name_nonblank" CHECK (btrim(display_name) <> ''::text);

ALTER TABLE synapse.users ADD CONSTRAINT "users_pkey" PRIMARY KEY (user_id);

ALTER TABLE synapse.audit_events ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.bureaus ADD CONSTRAINT "bureaus_parent_bureau_id_fkey" FOREIGN KEY (parent_bureau_id) REFERENCES synapse.bureaus(bureau_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_access_grant_approvals ADD CONSTRAINT "case_access_grant_approvals_approver_user_id_fkey" FOREIGN KEY (approver_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_access_grant_approvals ADD CONSTRAINT "case_access_grant_approvals_approving_bureau_id_fkey" FOREIGN KEY (approving_bureau_id) REFERENCES synapse.bureaus(bureau_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_access_grant_approvals ADD CONSTRAINT "case_access_grant_approvals_case_access_request_id_fkey" FOREIGN KEY (case_access_request_id) REFERENCES synapse.case_access_requests(case_access_request_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_access_grant_approvals ADD CONSTRAINT "case_access_grant_approvals_case_id_fkey" FOREIGN KEY (case_id) REFERENCES synapse.cases(case_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_access_grant_approvals ADD CONSTRAINT "case_access_grant_approvals_grant_id_fkey" FOREIGN KEY (grant_id) REFERENCES synapse.case_access_grants(case_access_grant_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_access_grants ADD CONSTRAINT "case_access_grants_bureau_id_fkey" FOREIGN KEY (bureau_id) REFERENCES synapse.bureaus(bureau_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_access_grants ADD CONSTRAINT "case_access_grants_case_id_fkey" FOREIGN KEY (case_id) REFERENCES synapse.cases(case_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_access_grants ADD CONSTRAINT "case_access_grants_granted_by_user_id_fkey" FOREIGN KEY (granted_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_access_grants ADD CONSTRAINT "case_access_grants_source_request_id_fkey" FOREIGN KEY (source_request_id) REFERENCES synapse.case_access_requests(case_access_request_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_access_grants ADD CONSTRAINT "case_access_grants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_access_requests ADD CONSTRAINT "case_access_requests_approver_user_id_fkey" FOREIGN KEY (approver_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_access_requests ADD CONSTRAINT "case_access_requests_case_id_fkey" FOREIGN KEY (case_id) REFERENCES synapse.cases(case_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_access_requests ADD CONSTRAINT "case_access_requests_requester_user_id_fkey" FOREIGN KEY (requester_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_assignments ADD CONSTRAINT "case_assignments_assigned_by_user_id_fkey" FOREIGN KEY (assigned_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_assignments ADD CONSTRAINT "case_assignments_bureau_id_fkey" FOREIGN KEY (bureau_id) REFERENCES synapse.bureaus(bureau_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_assignments ADD CONSTRAINT "case_assignments_case_id_fkey" FOREIGN KEY (case_id) REFERENCES synapse.cases(case_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_assignments ADD CONSTRAINT "case_assignments_officer_id_fkey" FOREIGN KEY (officer_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_categories ADD CONSTRAINT "case_categories_parent_category_id_fkey" FOREIGN KEY (parent_category_id) REFERENCES synapse.case_categories(category_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_comments ADD CONSTRAINT "case_comments_author_user_id_fkey" FOREIGN KEY (author_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_comments ADD CONSTRAINT "case_comments_case_id_fkey" FOREIGN KEY (case_id) REFERENCES synapse.cases(case_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_comments ADD CONSTRAINT "case_comments_work_item_id_fkey" FOREIGN KEY (work_item_id) REFERENCES synapse.case_work_items(work_item_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_issue_links ADD CONSTRAINT "case_issue_links_case_id_fkey" FOREIGN KEY (case_id) REFERENCES synapse.cases(case_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_issue_links ADD CONSTRAINT "case_issue_links_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES synapse.issues(issue_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_issue_links ADD CONSTRAINT "case_issue_links_linked_by_user_id_fkey" FOREIGN KEY (linked_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_issue_links ADD CONSTRAINT "case_issue_links_reviewed_by_user_id_fkey" FOREIGN KEY (reviewed_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_relationships ADD CONSTRAINT "case_relationship_source_finding_fk" FOREIGN KEY (source_conflict_finding_id) REFERENCES synapse.conflict_findings(conflict_finding_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_relationships ADD CONSTRAINT "case_relationships_proposed_by_user_id_fkey" FOREIGN KEY (proposed_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_relationships ADD CONSTRAINT "case_relationships_relationship_type_fkey" FOREIGN KEY (relationship_type) REFERENCES synapse.case_relationship_types(relationship_type) ON DELETE RESTRICT;

ALTER TABLE synapse.case_relationships ADD CONSTRAINT "case_relationships_reviewed_by_user_id_fkey" FOREIGN KEY (reviewed_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_relationships ADD CONSTRAINT "case_relationships_source_case_id_fkey" FOREIGN KEY (source_case_id) REFERENCES synapse.cases(case_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_relationships ADD CONSTRAINT "case_relationships_target_case_id_fkey" FOREIGN KEY (target_case_id) REFERENCES synapse.cases(case_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_status_history ADD CONSTRAINT "case_status_history_case_id_fkey" FOREIGN KEY (case_id) REFERENCES synapse.cases(case_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_status_history ADD CONSTRAINT "case_status_history_changed_by_user_id_fkey" FOREIGN KEY (changed_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_status_history ADD CONSTRAINT "case_status_history_from_status_code_fkey" FOREIGN KEY (from_status_code) REFERENCES synapse.case_statuses(status_code) ON DELETE RESTRICT;

ALTER TABLE synapse.case_status_history ADD CONSTRAINT "case_status_history_to_status_code_fkey" FOREIGN KEY (to_status_code) REFERENCES synapse.case_statuses(status_code) ON DELETE RESTRICT;

ALTER TABLE synapse.case_submissions ADD CONSTRAINT "case_submissions_duplicate_of_submission_id_fkey" FOREIGN KEY (duplicate_of_submission_id) REFERENCES synapse.case_submissions(submission_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_submissions ADD CONSTRAINT "case_submissions_inbound_message_id_fkey" FOREIGN KEY (inbound_message_id) REFERENCES synapse.inbound_messages(inbound_message_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_submissions ADD CONSTRAINT "case_submissions_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES synapse.institutions(institution_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_submissions ADD CONSTRAINT "case_submissions_reviewed_by_user_id_fkey" FOREIGN KEY (reviewed_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_submissions ADD CONSTRAINT "case_submissions_submitted_by_user_id_fkey" FOREIGN KEY (submitted_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_transfer_approvals ADD CONSTRAINT "case_transfer_approvals_approver_user_id_fkey" FOREIGN KEY (approver_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_transfer_approvals ADD CONSTRAINT "case_transfer_approvals_case_transfer_id_fkey" FOREIGN KEY (case_transfer_id) REFERENCES synapse.case_transfers(case_transfer_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_transfers ADD CONSTRAINT "case_transfers_approved_by_user_id_fkey" FOREIGN KEY (approved_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_transfers ADD CONSTRAINT "case_transfers_case_id_fkey" FOREIGN KEY (case_id) REFERENCES synapse.cases(case_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_transfers ADD CONSTRAINT "case_transfers_from_bureau_id_fkey" FOREIGN KEY (from_bureau_id) REFERENCES synapse.bureaus(bureau_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_transfers ADD CONSTRAINT "case_transfers_from_officer_id_fkey" FOREIGN KEY (from_officer_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_transfers ADD CONSTRAINT "case_transfers_requested_by_user_id_fkey" FOREIGN KEY (requested_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_transfers ADD CONSTRAINT "case_transfers_to_bureau_id_fkey" FOREIGN KEY (to_bureau_id) REFERENCES synapse.bureaus(bureau_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_transfers ADD CONSTRAINT "case_transfers_to_officer_id_fkey" FOREIGN KEY (to_officer_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_work_items ADD CONSTRAINT "case_work_items_assigned_to_user_id_fkey" FOREIGN KEY (assigned_to_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_work_items ADD CONSTRAINT "case_work_items_bureau_id_fkey" FOREIGN KEY (bureau_id) REFERENCES synapse.bureaus(bureau_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_work_items ADD CONSTRAINT "case_work_items_case_id_fkey" FOREIGN KEY (case_id) REFERENCES synapse.cases(case_id) ON DELETE RESTRICT;

ALTER TABLE synapse.case_work_items ADD CONSTRAINT "case_work_items_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.cases ADD CONSTRAINT "cases_accountable_officer_id_fkey" FOREIGN KEY (accountable_officer_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.cases ADD CONSTRAINT "cases_campus_belongs_to_institution_fk" FOREIGN KEY (campus_id, institution_id) REFERENCES synapse.institution_campuses(campus_id, institution_id) ON DELETE RESTRICT;

ALTER TABLE synapse.cases ADD CONSTRAINT "cases_campus_id_fkey" FOREIGN KEY (campus_id) REFERENCES synapse.institution_campuses(campus_id) ON DELETE RESTRICT;

ALTER TABLE synapse.cases ADD CONSTRAINT "cases_category_id_fkey" FOREIGN KEY (category_id) REFERENCES synapse.case_categories(category_id) ON DELETE RESTRICT;

ALTER TABLE synapse.cases ADD CONSTRAINT "cases_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.cases ADD CONSTRAINT "cases_current_status_code_fkey" FOREIGN KEY (current_status_code) REFERENCES synapse.case_statuses(status_code) ON DELETE RESTRICT;

ALTER TABLE synapse.cases ADD CONSTRAINT "cases_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES synapse.institutions(institution_id) ON DELETE RESTRICT;

ALTER TABLE synapse.cases ADD CONSTRAINT "cases_lead_bureau_id_fkey" FOREIGN KEY (lead_bureau_id) REFERENCES synapse.bureaus(bureau_id) ON DELETE RESTRICT;

ALTER TABLE synapse.claim_source_references ADD CONSTRAINT "claim_source_references_document_version_id_fkey" FOREIGN KEY (document_version_id) REFERENCES synapse.document_versions(document_version_id) ON DELETE RESTRICT;

ALTER TABLE synapse.claim_source_references ADD CONSTRAINT "claim_source_references_evidence_claim_id_fkey" FOREIGN KEY (evidence_claim_id) REFERENCES synapse.evidence_claims(evidence_claim_id) ON DELETE RESTRICT;

ALTER TABLE synapse.closure_approvals ADD CONSTRAINT "closure_approvals_approver_user_id_fkey" FOREIGN KEY (approver_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.closure_approvals ADD CONSTRAINT "closure_approvals_case_id_fkey" FOREIGN KEY (case_id) REFERENCES synapse.cases(case_id) ON DELETE RESTRICT;

ALTER TABLE synapse.closure_approvals ADD CONSTRAINT "closure_approvals_closure_evaluation_id_fkey" FOREIGN KEY (closure_evaluation_id) REFERENCES synapse.closure_evaluations(closure_evaluation_id) ON DELETE RESTRICT;

ALTER TABLE synapse.closure_checklist_versions ADD CONSTRAINT "closure_checklist_versions_approved_by_user_id_fkey" FOREIGN KEY (approved_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.closure_checklist_versions ADD CONSTRAINT "closure_checklist_versions_closure_checklist_id_fkey" FOREIGN KEY (closure_checklist_id) REFERENCES synapse.closure_checklists(closure_checklist_id) ON DELETE RESTRICT;

ALTER TABLE synapse.closure_checklist_versions ADD CONSTRAINT "closure_checklist_versions_policy_version_id_fkey" FOREIGN KEY (policy_version_id) REFERENCES synapse.policy_versions(policy_version_id) ON DELETE RESTRICT;

ALTER TABLE synapse.closure_checklists ADD CONSTRAINT "closure_checklists_category_id_fkey" FOREIGN KEY (category_id) REFERENCES synapse.case_categories(category_id) ON DELETE RESTRICT;

ALTER TABLE synapse.closure_evaluation_items ADD CONSTRAINT "closure_evaluation_items_closure_evaluation_id_fkey" FOREIGN KEY (closure_evaluation_id) REFERENCES synapse.closure_evaluations(closure_evaluation_id) ON DELETE RESTRICT;

ALTER TABLE synapse.closure_evaluation_items ADD CONSTRAINT "closure_evaluation_items_closure_requirement_id_fkey" FOREIGN KEY (closure_requirement_id) REFERENCES synapse.closure_requirements(closure_requirement_id) ON DELETE RESTRICT;

ALTER TABLE synapse.closure_evaluation_items ADD CONSTRAINT "closure_evaluation_items_evidence_item_id_fkey" FOREIGN KEY (evidence_item_id) REFERENCES synapse.evidence_items(evidence_item_id) ON DELETE RESTRICT;

ALTER TABLE synapse.closure_evaluations ADD CONSTRAINT "closure_evaluations_case_id_fkey" FOREIGN KEY (case_id) REFERENCES synapse.cases(case_id) ON DELETE RESTRICT;

ALTER TABLE synapse.closure_evaluations ADD CONSTRAINT "closure_evaluations_closure_checklist_version_id_fkey" FOREIGN KEY (closure_checklist_version_id) REFERENCES synapse.closure_checklist_versions(closure_checklist_version_id) ON DELETE RESTRICT;

ALTER TABLE synapse.closure_evaluations ADD CONSTRAINT "closure_evaluations_evaluated_by_user_id_fkey" FOREIGN KEY (evaluated_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.closure_exceptions ADD CONSTRAINT "closure_exceptions_approved_by_user_id_fkey" FOREIGN KEY (approved_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.closure_exceptions ADD CONSTRAINT "closure_exceptions_case_id_fkey" FOREIGN KEY (case_id) REFERENCES synapse.cases(case_id) ON DELETE RESTRICT;

ALTER TABLE synapse.closure_exceptions ADD CONSTRAINT "closure_exceptions_closure_requirement_id_fkey" FOREIGN KEY (closure_requirement_id) REFERENCES synapse.closure_requirements(closure_requirement_id) ON DELETE RESTRICT;

ALTER TABLE synapse.closure_exceptions ADD CONSTRAINT "closure_exceptions_requested_by_user_id_fkey" FOREIGN KEY (requested_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.closure_requirements ADD CONSTRAINT "closure_requirements_closure_checklist_version_id_fkey" FOREIGN KEY (closure_checklist_version_id) REFERENCES synapse.closure_checklist_versions(closure_checklist_version_id) ON DELETE RESTRICT;

ALTER TABLE synapse.conflict_finding_actions ADD CONSTRAINT "conflict_finding_actions_conflict_finding_id_fkey" FOREIGN KEY (conflict_finding_id) REFERENCES synapse.conflict_findings(conflict_finding_id) ON DELETE RESTRICT;

ALTER TABLE synapse.conflict_finding_actions ADD CONSTRAINT "conflict_finding_actions_regulatory_action_id_fkey" FOREIGN KEY (regulatory_action_id) REFERENCES synapse.regulatory_actions(regulatory_action_id) ON DELETE RESTRICT;

ALTER TABLE synapse.conflict_findings ADD CONSTRAINT "conflict_findings_conflict_rule_id_fkey" FOREIGN KEY (conflict_rule_id) REFERENCES synapse.conflict_rules(conflict_rule_id) ON DELETE RESTRICT;

ALTER TABLE synapse.conflict_findings ADD CONSTRAINT "conflict_findings_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES synapse.institutions(institution_id) ON DELETE RESTRICT;

ALTER TABLE synapse.conflict_findings ADD CONSTRAINT "conflict_findings_reviewed_by_user_id_fkey" FOREIGN KEY (reviewed_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.conflict_rule_action_links ADD CONSTRAINT "conflict_rule_action_links_conflict_rule_id_fkey" FOREIGN KEY (conflict_rule_id) REFERENCES synapse.conflict_rules(conflict_rule_id) ON DELETE RESTRICT;

ALTER TABLE synapse.conflict_rule_action_links ADD CONSTRAINT "conflict_rule_action_links_regulatory_action_id_fkey" FOREIGN KEY (regulatory_action_id) REFERENCES synapse.regulatory_actions(regulatory_action_id) ON DELETE RESTRICT;

ALTER TABLE synapse.conflict_rules ADD CONSTRAINT "conflict_rules_approved_by_user_id_fkey" FOREIGN KEY (approved_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.conflict_rules ADD CONSTRAINT "conflict_rules_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.conflict_rules ADD CONSTRAINT "conflict_rules_policy_version_id_fkey" FOREIGN KEY (policy_version_id) REFERENCES synapse.policy_versions(policy_version_id) ON DELETE RESTRICT;

ALTER TABLE synapse.contradiction_findings ADD CONSTRAINT "contradiction_findings_claim_a_id_fkey" FOREIGN KEY (claim_a_id) REFERENCES synapse.evidence_claims(evidence_claim_id) ON DELETE RESTRICT;

ALTER TABLE synapse.contradiction_findings ADD CONSTRAINT "contradiction_findings_claim_b_id_fkey" FOREIGN KEY (claim_b_id) REFERENCES synapse.evidence_claims(evidence_claim_id) ON DELETE RESTRICT;

ALTER TABLE synapse.contradiction_findings ADD CONSTRAINT "contradiction_findings_reviewed_by_user_id_fkey" FOREIGN KEY (reviewed_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.document_extractions ADD CONSTRAINT "document_extractions_document_version_id_fkey" FOREIGN KEY (document_version_id) REFERENCES synapse.document_versions(document_version_id) ON DELETE RESTRICT;

ALTER TABLE synapse.document_versions ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY (document_id) REFERENCES synapse.documents(document_id) ON DELETE RESTRICT;

ALTER TABLE synapse.document_versions ADD CONSTRAINT "document_versions_uploaded_by_user_id_fkey" FOREIGN KEY (uploaded_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.documents ADD CONSTRAINT "documents_owner_case_id_fkey" FOREIGN KEY (owner_case_id) REFERENCES synapse.cases(case_id) ON DELETE RESTRICT;

ALTER TABLE synapse.documents ADD CONSTRAINT "documents_owner_submission_id_fkey" FOREIGN KEY (owner_submission_id) REFERENCES synapse.case_submissions(submission_id) ON DELETE RESTRICT;

ALTER TABLE synapse.documents ADD CONSTRAINT "documents_uploaded_by_user_id_fkey" FOREIGN KEY (uploaded_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.evidence_claims ADD CONSTRAINT "evidence_claims_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.evidence_claims ADD CONSTRAINT "evidence_claims_evidence_item_id_fkey" FOREIGN KEY (evidence_item_id) REFERENCES synapse.evidence_items(evidence_item_id) ON DELETE RESTRICT;

ALTER TABLE synapse.evidence_items ADD CONSTRAINT "evidence_items_case_id_fkey" FOREIGN KEY (case_id) REFERENCES synapse.cases(case_id) ON DELETE RESTRICT;

ALTER TABLE synapse.evidence_items ADD CONSTRAINT "evidence_items_document_version_id_fkey" FOREIGN KEY (document_version_id) REFERENCES synapse.document_versions(document_version_id) ON DELETE RESTRICT;

ALTER TABLE synapse.evidence_items ADD CONSTRAINT "evidence_items_regulatory_action_id_fkey" FOREIGN KEY (regulatory_action_id) REFERENCES synapse.regulatory_actions(regulatory_action_id) ON DELETE RESTRICT;

ALTER TABLE synapse.evidence_items ADD CONSTRAINT "evidence_items_verified_by_user_id_fkey" FOREIGN KEY (verified_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.inbound_messages ADD CONSTRAINT "inbound_messages_integration_source_id_fkey" FOREIGN KEY (integration_source_id) REFERENCES synapse.integration_sources(integration_source_id) ON DELETE RESTRICT;

ALTER TABLE synapse.institution_aliases ADD CONSTRAINT "institution_aliases_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES synapse.institutions(institution_id) ON DELETE RESTRICT;

ALTER TABLE synapse.institution_campuses ADD CONSTRAINT "institution_campuses_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES synapse.institutions(institution_id) ON DELETE RESTRICT;

ALTER TABLE synapse.institution_identifiers ADD CONSTRAINT "institution_identifiers_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES synapse.institutions(institution_id) ON DELETE RESTRICT;

ALTER TABLE synapse.institutions ADD CONSTRAINT "institutions_region_id_fkey" FOREIGN KEY (region_id) REFERENCES synapse.regions(region_id) ON DELETE RESTRICT;

ALTER TABLE synapse.integration_events ADD CONSTRAINT "integration_events_integration_source_id_fkey" FOREIGN KEY (integration_source_id) REFERENCES synapse.integration_sources(integration_source_id) ON DELETE RESTRICT;

ALTER TABLE synapse.integration_reconciliation_runs ADD CONSTRAINT "integration_reconciliation_runs_integration_source_id_fkey" FOREIGN KEY (integration_source_id) REFERENCES synapse.integration_sources(integration_source_id) ON DELETE RESTRICT;

ALTER TABLE synapse.issues ADD CONSTRAINT "issues_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.issues ADD CONSTRAINT "issues_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES synapse.institutions(institution_id) ON DELETE RESTRICT;

ALTER TABLE synapse.match_candidates ADD CONSTRAINT "match_candidates_candidate_case_id_fkey" FOREIGN KEY (candidate_case_id) REFERENCES synapse.cases(case_id) ON DELETE RESTRICT;

ALTER TABLE synapse.match_candidates ADD CONSTRAINT "match_candidates_candidate_submission_id_fkey" FOREIGN KEY (candidate_submission_id) REFERENCES synapse.case_submissions(submission_id) ON DELETE RESTRICT;

ALTER TABLE synapse.match_candidates ADD CONSTRAINT "match_candidates_match_run_id_fkey" FOREIGN KEY (match_run_id) REFERENCES synapse.match_runs(match_run_id) ON DELETE RESTRICT;

ALTER TABLE synapse.match_candidates ADD CONSTRAINT "match_candidates_reviewed_by_user_id_fkey" FOREIGN KEY (reviewed_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.match_runs ADD CONSTRAINT "match_runs_ai_model_version_id_fkey" FOREIGN KEY (ai_model_version_id) REFERENCES synapse.ai_model_versions(ai_model_version_id) ON DELETE RESTRICT;

ALTER TABLE synapse.match_runs ADD CONSTRAINT "match_runs_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES synapse.case_submissions(submission_id) ON DELETE RESTRICT;

ALTER TABLE synapse.notification_deliveries ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY (notification_id) REFERENCES synapse.notifications(notification_id) ON DELETE RESTRICT;

ALTER TABLE synapse.notifications ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY (recipient_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.notifications ADD CONSTRAINT "notifications_related_case_id_fkey" FOREIGN KEY (related_case_id) REFERENCES synapse.cases(case_id) ON DELETE RESTRICT;

ALTER TABLE synapse.policy_versions ADD CONSTRAINT "policy_versions_approved_by_user_id_fkey" FOREIGN KEY (approved_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.policy_versions ADD CONSTRAINT "policy_versions_policy_source_id_fkey" FOREIGN KEY (policy_source_id) REFERENCES synapse.policy_sources(policy_source_id) ON DELETE RESTRICT;

ALTER TABLE synapse.regulatory_action_participants ADD CONSTRAINT "regulatory_action_participants_added_by_user_id_fkey" FOREIGN KEY (added_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.regulatory_action_participants ADD CONSTRAINT "regulatory_action_participants_bureau_id_fkey" FOREIGN KEY (bureau_id) REFERENCES synapse.bureaus(bureau_id) ON DELETE RESTRICT;

ALTER TABLE synapse.regulatory_action_participants ADD CONSTRAINT "regulatory_action_participants_regulatory_action_id_fkey" FOREIGN KEY (regulatory_action_id) REFERENCES synapse.regulatory_actions(regulatory_action_id) ON DELETE RESTRICT;

ALTER TABLE synapse.regulatory_actions ADD CONSTRAINT "regulatory_actions_case_id_fkey" FOREIGN KEY (case_id) REFERENCES synapse.cases(case_id) ON DELETE RESTRICT;

ALTER TABLE synapse.regulatory_actions ADD CONSTRAINT "regulatory_actions_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.regulatory_actions ADD CONSTRAINT "regulatory_actions_institution_id_fkey" FOREIGN KEY (institution_id) REFERENCES synapse.institutions(institution_id) ON DELETE RESTRICT;

ALTER TABLE synapse.regulatory_actions ADD CONSTRAINT "regulatory_actions_lead_bureau_id_fkey" FOREIGN KEY (lead_bureau_id) REFERENCES synapse.bureaus(bureau_id) ON DELETE RESTRICT;

ALTER TABLE synapse.regulatory_actions ADD CONSTRAINT "regulatory_actions_policy_version_id_fkey" FOREIGN KEY (policy_version_id) REFERENCES synapse.policy_versions(policy_version_id) ON DELETE RESTRICT;

ALTER TABLE synapse.retention_actions ADD CONSTRAINT "retention_actions_performed_by_user_id_fkey" FOREIGN KEY (performed_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.retention_actions ADD CONSTRAINT "retention_actions_retention_policy_id_fkey" FOREIGN KEY (retention_policy_id) REFERENCES synapse.retention_policies(retention_policy_id) ON DELETE RESTRICT;

ALTER TABLE synapse.retention_policies ADD CONSTRAINT "retention_policies_policy_version_id_fkey" FOREIGN KEY (policy_version_id) REFERENCES synapse.policy_versions(policy_version_id) ON DELETE RESTRICT;

ALTER TABLE synapse.role_permissions ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY (permission_id) REFERENCES synapse.permissions(permission_id) ON DELETE RESTRICT;

ALTER TABLE synapse.role_permissions ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY (role_id) REFERENCES synapse.roles(role_id) ON DELETE RESTRICT;

ALTER TABLE synapse.sla_events ADD CONSTRAINT "sla_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.sla_events ADD CONSTRAINT "sla_events_policy_version_id_fkey" FOREIGN KEY (policy_version_id) REFERENCES synapse.sla_policy_versions(sla_policy_version_id) ON DELETE RESTRICT;

ALTER TABLE synapse.sla_events ADD CONSTRAINT "sla_events_sla_instance_id_fkey" FOREIGN KEY (sla_instance_id) REFERENCES synapse.sla_instances(sla_instance_id) ON DELETE RESTRICT;

ALTER TABLE synapse.sla_instances ADD CONSTRAINT "sla_instances_case_id_fkey" FOREIGN KEY (case_id) REFERENCES synapse.cases(case_id) ON DELETE RESTRICT;

ALTER TABLE synapse.sla_instances ADD CONSTRAINT "sla_instances_sla_policy_version_id_fkey" FOREIGN KEY (sla_policy_version_id) REFERENCES synapse.sla_policy_versions(sla_policy_version_id) ON DELETE RESTRICT;

ALTER TABLE synapse.sla_instances ADD CONSTRAINT "sla_instances_work_item_id_fkey" FOREIGN KEY (work_item_id) REFERENCES synapse.case_work_items(work_item_id) ON DELETE RESTRICT;

ALTER TABLE synapse.sla_policy_versions ADD CONSTRAINT "sla_policy_versions_applies_to_category_id_fkey" FOREIGN KEY (applies_to_category_id) REFERENCES synapse.case_categories(category_id) ON DELETE RESTRICT;

ALTER TABLE synapse.sla_policy_versions ADD CONSTRAINT "sla_policy_versions_approved_by_user_id_fkey" FOREIGN KEY (approved_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.sla_policy_versions ADD CONSTRAINT "sla_policy_versions_policy_version_id_fkey" FOREIGN KEY (policy_version_id) REFERENCES synapse.policy_versions(policy_version_id) ON DELETE RESTRICT;

ALTER TABLE synapse.sla_policy_versions ADD CONSTRAINT "sla_policy_versions_sla_policy_id_fkey" FOREIGN KEY (sla_policy_id) REFERENCES synapse.sla_policies(sla_policy_id) ON DELETE RESTRICT;

ALTER TABLE synapse.submission_case_links ADD CONSTRAINT "submission_case_links_case_id_fkey" FOREIGN KEY (case_id) REFERENCES synapse.cases(case_id) ON DELETE RESTRICT;

ALTER TABLE synapse.submission_case_links ADD CONSTRAINT "submission_case_links_confirmed_by_user_id_fkey" FOREIGN KEY (confirmed_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.submission_case_links ADD CONSTRAINT "submission_case_links_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES synapse.case_submissions(submission_id) ON DELETE RESTRICT;

ALTER TABLE synapse.submission_translations ADD CONSTRAINT "submission_translations_reviewed_by_user_id_fkey" FOREIGN KEY (reviewed_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.submission_translations ADD CONSTRAINT "submission_translations_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES synapse.case_submissions(submission_id) ON DELETE RESTRICT;

ALTER TABLE synapse.user_bureau_memberships ADD CONSTRAINT "user_bureau_memberships_bureau_id_fkey" FOREIGN KEY (bureau_id) REFERENCES synapse.bureaus(bureau_id) ON DELETE RESTRICT;

ALTER TABLE synapse.user_bureau_memberships ADD CONSTRAINT "user_bureau_memberships_user_id_fkey" FOREIGN KEY (user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.user_role_assignments ADD CONSTRAINT "user_role_assignments_assigned_by_user_id_fkey" FOREIGN KEY (assigned_by_user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

ALTER TABLE synapse.user_role_assignments ADD CONSTRAINT "user_role_assignments_bureau_id_fkey" FOREIGN KEY (bureau_id) REFERENCES synapse.bureaus(bureau_id) ON DELETE RESTRICT;

ALTER TABLE synapse.user_role_assignments ADD CONSTRAINT "user_role_assignments_region_id_fkey" FOREIGN KEY (region_id) REFERENCES synapse.regions(region_id) ON DELETE RESTRICT;

ALTER TABLE synapse.user_role_assignments ADD CONSTRAINT "user_role_assignments_role_id_fkey" FOREIGN KEY (role_id) REFERENCES synapse.roles(role_id) ON DELETE RESTRICT;

ALTER TABLE synapse.user_role_assignments ADD CONSTRAINT "user_role_assignments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES synapse.users(user_id) ON DELETE RESTRICT;

CREATE INDEX access_requests_case_status_idx ON synapse.case_access_requests USING btree (case_id, request_status, requested_at DESC);

CREATE INDEX access_requests_requester_idx ON synapse.case_access_requests USING btree (requester_user_id, request_status);

CREATE INDEX audit_events_actor_time_idx ON synapse.audit_events USING btree (actor_user_id, occurred_at DESC);

CREATE INDEX audit_events_entity_time_idx ON synapse.audit_events USING btree (entity_type, entity_id, occurred_at DESC);

CREATE INDEX case_access_grants_bureau_idx ON synapse.case_access_grants USING btree (bureau_id, granted_scope) WHERE (bureau_id IS NOT NULL);

CREATE INDEX case_access_grants_case_idx ON synapse.case_access_grants USING btree (case_id, granted_scope);

CREATE INDEX case_access_grants_user_idx ON synapse.case_access_grants USING btree (user_id, granted_scope) WHERE (user_id IS NOT NULL);

CREATE UNIQUE INDEX case_assignment_active_bureau_uq ON synapse.case_assignments USING btree (case_id, bureau_id, assignment_role) WHERE (valid_until IS NULL);

CREATE INDEX case_assignments_officer_idx ON synapse.case_assignments USING btree (officer_id, valid_until);

CREATE INDEX case_comments_case_time_idx ON synapse.case_comments USING btree (case_id, created_at DESC);

CREATE INDEX case_relationships_source_idx ON synapse.case_relationships USING btree (source_case_id, relationship_status);

CREATE INDEX case_relationships_target_idx ON synapse.case_relationships USING btree (target_case_id, relationship_status);

CREATE INDEX case_status_history_case_time_idx ON synapse.case_status_history USING btree (case_id, changed_at DESC);

CREATE INDEX case_transfers_case_time_idx ON synapse.case_transfers USING btree (case_id, requested_at DESC);

CREATE INDEX cases_bureau_status_idx ON synapse.cases USING btree (lead_bureau_id, current_status_code);

CREATE INDEX cases_category_received_idx ON synapse.cases USING btree (category_id, received_at DESC);

CREATE INDEX cases_institution_status_idx ON synapse.cases USING btree (institution_id, current_status_code);

CREATE INDEX cases_received_idx ON synapse.cases USING btree (received_at DESC);

CREATE INDEX cases_title_search_idx ON synapse.cases USING gin (to_tsvector('simple'::regconfig, ((title || ' '::text) || COALESCE(summary, ''::text))));

CREATE INDEX claim_source_refs_claim_idx ON synapse.claim_source_references USING btree (evidence_claim_id);

CREATE INDEX closure_approvals_case_time_idx ON synapse.closure_approvals USING btree (case_id, decided_at DESC);

CREATE INDEX closure_evaluations_case_time_idx ON synapse.closure_evaluations USING btree (case_id, evaluated_at DESC);

CREATE INDEX conflict_findings_institution_status_idx ON synapse.conflict_findings USING btree (institution_id, finding_status, detected_at DESC);

CREATE INDEX contradiction_findings_status_idx ON synapse.contradiction_findings USING btree (finding_status, detected_at DESC);

CREATE INDEX document_extractions_version_idx ON synapse.document_extractions USING btree (document_version_id, created_at DESC);

CREATE INDEX document_versions_document_idx ON synapse.document_versions USING btree (document_id, version_number DESC);

CREATE INDEX documents_case_idx ON synapse.documents USING btree (owner_case_id);

CREATE INDEX documents_submission_idx ON synapse.documents USING btree (owner_submission_id);

CREATE INDEX evidence_claims_evidence_idx ON synapse.evidence_claims USING btree (evidence_item_id);

CREATE INDEX evidence_items_action_idx ON synapse.evidence_items USING btree (regulatory_action_id);

CREATE INDEX evidence_items_case_idx ON synapse.evidence_items USING btree (case_id, received_at DESC);

CREATE INDEX inbound_fingerprint_idx ON synapse.inbound_messages USING btree (integration_source_id, normalized_fingerprint);

CREATE INDEX inbound_received_idx ON synapse.inbound_messages USING btree (received_at DESC);

CREATE INDEX institution_alias_name_idx ON synapse.institution_aliases USING btree (lower(alias_name));

CREATE INDEX institution_identifiers_institution_idx ON synapse.institution_identifiers USING btree (institution_id);

CREATE UNIQUE INDEX institution_one_primary_campus_uq ON synapse.institution_campuses USING btree (institution_id) WHERE is_primary;

CREATE UNIQUE INDEX institution_one_primary_identifier_uq ON synapse.institution_identifiers USING btree (institution_id, identifier_type) WHERE is_primary;

CREATE INDEX institutions_name_search_idx ON synapse.institutions USING gin (to_tsvector('simple'::regconfig, canonical_name));

CREATE INDEX integration_events_status_idx ON synapse.integration_events USING btree (event_status, received_at);

CREATE INDEX issues_institution_status_idx ON synapse.issues USING btree (institution_id, issue_status);

CREATE INDEX match_candidates_case_review_idx ON synapse.match_candidates USING btree (candidate_case_id, review_status);

CREATE INDEX match_candidates_run_idx ON synapse.match_candidates USING btree (match_run_id);

CREATE INDEX match_runs_submission_time_idx ON synapse.match_runs USING btree (submission_id, started_at DESC);

CREATE INDEX notification_deliveries_retry_idx ON synapse.notification_deliveries USING btree (delivery_status, attempted_at);

CREATE INDEX notifications_recipient_unread_idx ON synapse.notifications USING btree (recipient_user_id, created_at DESC) WHERE (read_at IS NULL);

CREATE INDEX policy_versions_effective_idx ON synapse.policy_versions USING btree (policy_source_id, effective_from DESC);

CREATE INDEX regulatory_actions_case_idx ON synapse.regulatory_actions USING btree (case_id);

CREATE INDEX regulatory_actions_institution_status_idx ON synapse.regulatory_actions USING btree (institution_id, action_status);

CREATE INDEX retention_actions_entity_idx ON synapse.retention_actions USING btree (entity_type, entity_id, performed_at DESC);

CREATE INDEX sla_events_instance_time_idx ON synapse.sla_events USING btree (sla_instance_id, occurred_at);

CREATE INDEX sla_instances_case_status_idx ON synapse.sla_instances USING btree (case_id, sla_status, current_due_at);

CREATE INDEX sla_instances_work_status_idx ON synapse.sla_instances USING btree (work_item_id, sla_status, current_due_at);

CREATE INDEX submission_translations_submission_idx ON synapse.submission_translations USING btree (submission_id, target_language_code);

CREATE INDEX submissions_institution_idx ON synapse.case_submissions USING btree (institution_id, received_at DESC);

CREATE INDEX submissions_status_received_idx ON synapse.case_submissions USING btree (submission_status, received_at);

CREATE UNIQUE INDEX user_bureau_membership_active_uq ON synapse.user_bureau_memberships USING btree (user_id, bureau_id) WHERE (valid_until IS NULL);

CREATE INDEX user_bureau_memberships_bureau_idx ON synapse.user_bureau_memberships USING btree (bureau_id, user_id);

CREATE INDEX user_role_assignments_bureau_idx ON synapse.user_role_assignments USING btree (bureau_id, role_id);

CREATE INDEX user_role_assignments_user_idx ON synapse.user_role_assignments USING btree (user_id, valid_until);

CREATE UNIQUE INDEX users_email_ci_uq ON synapse.users USING btree (lower(email));

CREATE INDEX work_items_bureau_status_due_idx ON synapse.case_work_items USING btree (bureau_id, status_code, due_at);

CREATE INDEX work_items_case_status_idx ON synapse.case_work_items USING btree (case_id, status_code);

CREATE OR REPLACE FUNCTION synapse.approve_case_access_request(p_request_id uuid, p_decision text, p_reason text, p_valid_until timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
DECLARE
  v_request synapse.case_access_requests%ROWTYPE;
  v_case synapse.cases%ROWTYPE;
  v_actor uuid := synapse.current_user_id();
  v_grant_id uuid;
  v_approver_bureau uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authenticated actor context is required' USING ERRCODE = '28000'; END IF;
  IF p_decision NOT IN ('APPROVED','REJECTED') THEN RAISE EXCEPTION 'Decision must be APPROVED or REJECTED'; END IF;
  IF btrim(coalesce(p_reason,'')) = '' THEN RAISE EXCEPTION 'Decision reason is required'; END IF;
  SELECT * INTO v_request FROM synapse.case_access_requests
   WHERE case_access_request_id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.request_status <> 'PENDING' THEN
    RAISE EXCEPTION 'Access request not found or no longer pending';
  END IF;
  SELECT * INTO v_case FROM synapse.cases WHERE case_id = v_request.case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Case not found'; END IF;
  IF NOT (synapse.is_global_admin() OR synapse.has_scoped_role('BUREAU_HEAD',v_case.lead_bureau_id)) THEN
    RAISE EXCEPTION 'Only a designated Bureau Head or global administrator may approve case access'
      USING ERRCODE = '42501';
  END IF;
  v_approver_bureau := v_case.lead_bureau_id;

  IF p_decision = 'REJECTED' THEN
    UPDATE synapse.case_access_requests
      SET request_status='REJECTED', approver_user_id=v_actor, decided_at=now(), decision_reason=p_reason
      WHERE case_access_request_id=p_request_id;
    INSERT INTO synapse.case_access_grant_approvals(
      case_access_request_id,case_id,approver_user_id,approving_bureau_id,decision,decision_reason
    ) VALUES (p_request_id,v_case.case_id,v_actor,v_approver_bureau,'REJECTED',p_reason);
    INSERT INTO synapse.audit_events(actor_user_id,event_type,entity_type,entity_id,reason,after_state)
    VALUES (v_actor,'CASE_ACCESS_REJECTED','case_access_request',p_request_id,p_reason,
      jsonb_build_object('decision','REJECTED','case_id',v_case.case_id));
    RETURN NULL;
  END IF;

  IF p_valid_until IS NOT NULL AND p_valid_until <= now() THEN
    RAISE EXCEPTION 'Grant expiry must be in the future';
  END IF;

  PERFORM set_config('synapse.access_grant_workflow','APPROVE_REQUEST',true);
  INSERT INTO synapse.case_access_grants(
    case_id,user_id,bureau_id,granted_scope,granted_by_user_id,source_request_id,valid_from,valid_until
  ) VALUES (
    v_case.case_id,
    CASE WHEN v_request.requested_scope = 'DISCOVER' THEN v_request.requester_user_id ELSE v_request.requester_user_id END,
    NULL,
    v_request.requested_scope,
    v_actor,
    p_request_id,
    now(),
    p_valid_until
  ) RETURNING case_access_grant_id INTO v_grant_id;
  PERFORM set_config('synapse.access_grant_workflow','',true);

  UPDATE synapse.case_access_requests
    SET request_status='APPROVED', approver_user_id=v_actor, decided_at=now(), decision_reason=p_reason
    WHERE case_access_request_id=p_request_id;
  INSERT INTO synapse.case_access_grant_approvals(
    case_access_request_id,case_id,approver_user_id,approving_bureau_id,decision,decision_reason,grant_id
  ) VALUES (p_request_id,v_case.case_id,v_actor,v_approver_bureau,'APPROVED',p_reason,v_grant_id);
  INSERT INTO synapse.audit_events(actor_user_id,event_type,entity_type,entity_id,reason,after_state)
  VALUES (v_actor,'CASE_ACCESS_GRANTED','case_access_grant',v_grant_id,p_reason,
    jsonb_build_object('case_id',v_case.case_id,'scope',v_request.requested_scope,'request_id',p_request_id));
  RETURN v_grant_id;
END;
$function$;

CREATE OR REPLACE FUNCTION synapse.approve_case_closure(p_case_id uuid, p_evaluation_id uuid, p_decision text, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
DECLARE
  v_case synapse.cases%ROWTYPE;
  v_eval synapse.closure_evaluations%ROWTYPE;
  v_actor uuid := synapse.current_user_id();
  v_approval uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authenticated actor context is required' USING ERRCODE = '28000'; END IF;
  IF p_decision NOT IN ('APPROVED','REJECTED','RETURNED') OR btrim(coalesce(p_reason,''))='' THEN
    RAISE EXCEPTION 'Valid decision and reason are required';
  END IF;
  SELECT * INTO v_case FROM synapse.cases WHERE case_id=p_case_id FOR UPDATE;
  SELECT * INTO v_eval FROM synapse.closure_evaluations
    WHERE closure_evaluation_id=p_evaluation_id AND case_id=p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Closure evaluation not found for this case'; END IF;
  IF NOT (synapse.is_global_admin() OR synapse.has_scoped_role('BUREAU_HEAD',v_case.lead_bureau_id)) THEN
    RAISE EXCEPTION 'Only an authorized Bureau Head or global administrator may approve closure'
      USING ERRCODE = '42501';
  END IF;
  IF p_decision='APPROVED' AND v_eval.evaluation_status <> 'PASS' THEN
    RAISE EXCEPTION 'A closure evaluation must PASS before approval';
  END IF;
  INSERT INTO synapse.closure_approvals(case_id,closure_evaluation_id,approver_user_id,decision,decision_reason)
  VALUES (p_case_id,p_evaluation_id,v_actor,p_decision,p_reason)
  RETURNING closure_approval_id INTO v_approval;
  INSERT INTO synapse.audit_events(actor_user_id,event_type,entity_type,entity_id,reason,after_state)
  VALUES (v_actor,'CASE_CLOSURE_DECISION','case',p_case_id,p_reason,
    jsonb_build_object('evaluation_id',p_evaluation_id,'decision',p_decision,'approval_id',v_approval));
  RETURN v_approval;
END;
$function$;

CREATE OR REPLACE FUNCTION synapse.can_discover_case(p_case_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
  SELECT
    synapse.is_global_admin()
    OR synapse.can_view_case(p_case_id)
    OR EXISTS (
      SELECT 1
      FROM synapse.cases target_case
      JOIN synapse.cases own_case
        ON own_case.institution_id = target_case.institution_id
      WHERE target_case.case_id = p_case_id
        AND synapse.is_bureau_member(own_case.lead_bureau_id)
    )
    OR EXISTS (
      SELECT 1 FROM synapse.case_access_grants g
      WHERE g.case_id = p_case_id
        AND g.granted_scope = 'DISCOVER'
        AND g.valid_from <= now()
        AND (g.valid_until IS NULL OR g.valid_until > now())
        AND g.revoked_at IS NULL
        AND (g.user_id = synapse.current_user_id()
          OR (g.bureau_id IS NOT NULL AND synapse.is_bureau_member(g.bureau_id)))
    )
$function$;

CREATE OR REPLACE FUNCTION synapse.can_view_case(p_case_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
  SELECT synapse.is_global_admin()
    OR EXISTS (
      SELECT 1 FROM synapse.cases c
      WHERE c.case_id = p_case_id
        AND (c.accountable_officer_id = synapse.current_user_id()
          OR synapse.is_bureau_member(c.lead_bureau_id)
          OR EXISTS (
            SELECT 1 FROM synapse.case_assignments a
            WHERE a.case_id=c.case_id AND a.officer_id=synapse.current_user_id()
              AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now())
          )
          OR EXISTS (
            SELECT 1 FROM synapse.case_access_grants g
            WHERE g.case_id=c.case_id AND g.granted_scope IN ('DETAILS','COORDINATE')
              AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
              AND g.revoked_at IS NULL
              AND (g.user_id=synapse.current_user_id()
                OR (g.bureau_id IS NOT NULL AND synapse.is_bureau_member(g.bureau_id)))
          ))
    )
$function$;

CREATE OR REPLACE FUNCTION synapse.can_view_documents_for_case(p_case_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
  SELECT synapse.is_global_admin()
    OR EXISTS (
      SELECT 1 FROM synapse.cases c
      WHERE c.case_id=p_case_id
        AND (
          synapse.is_bureau_member(c.lead_bureau_id)
          OR c.accountable_officer_id=synapse.current_user_id()
          OR EXISTS (
            SELECT 1 FROM synapse.case_assignments a
            WHERE a.case_id=c.case_id AND a.officer_id=synapse.current_user_id()
              AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now())
          )
          OR EXISTS (
            SELECT 1 FROM synapse.case_access_grants g
            WHERE g.case_id=c.case_id AND g.granted_scope='DOCUMENTS'
              AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
              AND g.revoked_at IS NULL
              AND (g.user_id=synapse.current_user_id()
                OR (g.bureau_id IS NOT NULL AND synapse.is_bureau_member(g.bureau_id)))
          )
        )
    )
$function$;

CREATE OR REPLACE FUNCTION synapse.complete_case_transfer(p_transfer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
DECLARE
  v_transfer synapse.case_transfers%ROWTYPE;
  v_case synapse.cases%ROWTYPE;
  v_actor uuid := synapse.current_user_id();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authenticated actor context is required' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_transfer FROM synapse.case_transfers WHERE case_transfer_id=p_transfer_id FOR UPDATE;
  IF NOT FOUND OR v_transfer.transfer_status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Only fully approved transfers can be completed';
  END IF;
  IF NOT (synapse.is_global_admin()
      OR synapse.has_scoped_role('BUREAU_HEAD',v_transfer.from_bureau_id)
      OR synapse.has_scoped_role('BUREAU_HEAD',v_transfer.to_bureau_id)) THEN
    RAISE EXCEPTION 'Actor is not authorized to complete this transfer' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM synapse.case_transfer_approvals
    WHERE case_transfer_id=p_transfer_id AND approval_side='SOURCE' AND decision='APPROVED')
    OR NOT EXISTS (SELECT 1 FROM synapse.case_transfer_approvals
    WHERE case_transfer_id=p_transfer_id AND approval_side='TARGET' AND decision='APPROVED') THEN
    RAISE EXCEPTION 'Both source and target Bureau approvals are required';
  END IF;
  SELECT * INTO v_case FROM synapse.cases WHERE case_id=v_transfer.case_id FOR UPDATE;
  IF NOT FOUND OR v_case.lead_bureau_id <> v_transfer.from_bureau_id THEN
    RAISE EXCEPTION 'Transfer source no longer owns the case';
  END IF;
  IF v_transfer.to_officer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM synapse.user_bureau_memberships m
    WHERE m.user_id=v_transfer.to_officer_id AND m.bureau_id=v_transfer.to_bureau_id
      AND m.valid_from<=now() AND (m.valid_until IS NULL OR m.valid_until>now())
  ) THEN RAISE EXCEPTION 'Target officer is not an active member of target Bureau'; END IF;

  UPDATE synapse.case_assignments SET valid_until=now()
    WHERE case_id=v_transfer.case_id AND assignment_role='LEAD' AND valid_until IS NULL;
  PERFORM set_config('synapse.workflow_action','TRANSFER',true);
  UPDATE synapse.cases SET lead_bureau_id=v_transfer.to_bureau_id,
    accountable_officer_id=v_transfer.to_officer_id
    WHERE case_id=v_transfer.case_id;
  PERFORM set_config('synapse.workflow_action','',true);
  INSERT INTO synapse.case_assignments(case_id,bureau_id,officer_id,assignment_role,assigned_by_user_id,reason)
  VALUES (v_transfer.case_id,v_transfer.to_bureau_id,v_transfer.to_officer_id,'LEAD',v_actor,
    'Approved transfer ' || p_transfer_id::text);
  UPDATE synapse.case_transfers SET transfer_status='COMPLETED',completed_at=now()
    WHERE case_transfer_id=p_transfer_id;
  INSERT INTO synapse.audit_events(actor_user_id,event_type,entity_type,entity_id,reason,before_state,after_state)
  VALUES (v_actor,'CASE_TRANSFER_COMPLETED','case',v_transfer.case_id,v_transfer.reason,
    jsonb_build_object('lead_bureau_id',v_case.lead_bureau_id,'accountable_officer_id',v_case.accountable_officer_id),
    jsonb_build_object('lead_bureau_id',v_transfer.to_bureau_id,'accountable_officer_id',v_transfer.to_officer_id,
      'transfer_id',p_transfer_id));
END;
$function$;

CREATE OR REPLACE FUNCTION synapse.current_user_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  SELECT NULLIF(current_setting('synapse.user_id', true), '')::uuid
$function$;

CREATE OR REPLACE FUNCTION synapse.decide_case_transfer(p_transfer_id uuid, p_approval_side text, p_decision text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
DECLARE
  v_transfer synapse.case_transfers%ROWTYPE;
  v_case synapse.cases%ROWTYPE;
  v_actor uuid := synapse.current_user_id();
  v_bureau uuid;
  v_source_approved boolean;
  v_target_approved boolean;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authenticated actor context is required' USING ERRCODE = '28000'; END IF;
  IF p_approval_side NOT IN ('SOURCE','TARGET') OR p_decision NOT IN ('APPROVED','REJECTED') THEN
    RAISE EXCEPTION 'Invalid approval side or decision';
  END IF;
  IF btrim(coalesce(p_reason,'')) = '' THEN RAISE EXCEPTION 'Decision reason is required'; END IF;
  SELECT * INTO v_transfer FROM synapse.case_transfers
    WHERE case_transfer_id=p_transfer_id FOR UPDATE;
  IF NOT FOUND OR v_transfer.transfer_status <> 'REQUESTED' THEN
    RAISE EXCEPTION 'Transfer not found or no longer awaiting approval';
  END IF;
  SELECT * INTO v_case FROM synapse.cases WHERE case_id=v_transfer.case_id FOR UPDATE;
  IF NOT FOUND OR v_case.lead_bureau_id <> v_transfer.from_bureau_id THEN
    RAISE EXCEPTION 'Transfer source does not match current case owner';
  END IF;
  v_bureau := CASE WHEN p_approval_side='SOURCE' THEN v_transfer.from_bureau_id ELSE v_transfer.to_bureau_id END;
  IF NOT (synapse.is_global_admin() OR synapse.has_scoped_role('BUREAU_HEAD',v_bureau)) THEN
    RAISE EXCEPTION 'Actor is not an authorized approver for the % Bureau', p_approval_side
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM synapse.case_transfer_approvals
      WHERE case_transfer_id=p_transfer_id AND approval_side=p_approval_side) THEN
    RAISE EXCEPTION 'This transfer side has already been decided';
  END IF;

  INSERT INTO synapse.case_transfer_approvals(
    case_transfer_id,approval_side,approver_user_id,decision,decision_reason
  ) VALUES (p_transfer_id,p_approval_side,v_actor,p_decision,p_reason);

  IF p_decision='REJECTED' THEN
    UPDATE synapse.case_transfers SET transfer_status='REJECTED',
      approved_by_user_id=v_actor, decided_at=now(),
      reason=reason || E'\\nRejected (' || p_approval_side || '): ' || p_reason
      WHERE case_transfer_id=p_transfer_id;
    INSERT INTO synapse.audit_events(actor_user_id,event_type,entity_type,entity_id,reason)
      VALUES (v_actor,'CASE_TRANSFER_REJECTED','case_transfer',p_transfer_id,p_reason);
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM synapse.case_transfer_approvals
    WHERE case_transfer_id=p_transfer_id AND approval_side='SOURCE' AND decision='APPROVED') INTO v_source_approved;
  SELECT EXISTS (SELECT 1 FROM synapse.case_transfer_approvals
    WHERE case_transfer_id=p_transfer_id AND approval_side='TARGET' AND decision='APPROVED') INTO v_target_approved;

  IF v_source_approved AND v_target_approved THEN
    IF EXISTS (
      SELECT 1 FROM synapse.case_transfer_approvals a
      JOIN synapse.case_transfer_approvals b ON b.case_transfer_id=a.case_transfer_id
      WHERE a.case_transfer_id=p_transfer_id AND a.approval_side='SOURCE'
        AND b.approval_side='TARGET' AND a.approver_user_id=b.approver_user_id
    ) THEN
      RAISE EXCEPTION 'Source and target approvals must be provided by distinct users';
    END IF;
    UPDATE synapse.case_transfers SET transfer_status='APPROVED',
      approved_by_user_id=v_actor, decided_at=now()
      WHERE case_transfer_id=p_transfer_id;
  END IF;
  INSERT INTO synapse.audit_events(actor_user_id,event_type,entity_type,entity_id,reason,after_state)
    VALUES (v_actor,'CASE_TRANSFER_DECISION','case_transfer',p_transfer_id,p_reason,
      jsonb_build_object('side',p_approval_side,'decision',p_decision,
        'source_approved',v_source_approved,'target_approved',v_target_approved));
END;
$function$;

CREATE OR REPLACE FUNCTION synapse.decide_closure_exception(p_exception_id uuid, p_decision text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
DECLARE
  v_exception synapse.closure_exceptions%ROWTYPE;
  v_case synapse.cases%ROWTYPE;
  v_actor uuid := synapse.current_user_id();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authenticated actor context is required' USING ERRCODE = '28000'; END IF;
  IF p_decision NOT IN ('APPROVED','REJECTED') OR btrim(coalesce(p_reason,''))='' THEN
    RAISE EXCEPTION 'Valid exception decision and reason are required';
  END IF;
  SELECT * INTO v_exception FROM synapse.closure_exceptions
    WHERE closure_exception_id=p_exception_id FOR UPDATE;
  IF NOT FOUND OR v_exception.exception_status <> 'REQUESTED' THEN
    RAISE EXCEPTION 'Exception not found or already decided';
  END IF;
  SELECT * INTO v_case FROM synapse.cases WHERE case_id=v_exception.case_id;
  IF NOT (synapse.is_global_admin() OR synapse.has_scoped_role('BUREAU_HEAD',v_case.lead_bureau_id)) THEN
    RAISE EXCEPTION 'Only a designated Bureau Head or global administrator may decide closure exceptions'
      USING ERRCODE = '42501';
  END IF;
  UPDATE synapse.closure_exceptions
    SET exception_status=p_decision,approved_by_user_id=v_actor,decided_at=now(),
        reason=reason || E'\\nDecision: ' || p_reason
    WHERE closure_exception_id=p_exception_id;
  INSERT INTO synapse.audit_events(actor_user_id,event_type,entity_type,entity_id,reason,after_state)
  VALUES (v_actor,'CLOSURE_EXCEPTION_DECIDED','closure_exception',p_exception_id,p_reason,
    jsonb_build_object('decision',p_decision,'case_id',v_exception.case_id));
END;
$function$;

CREATE OR REPLACE FUNCTION synapse.dispose_case(p_case_id uuid, p_closure_evaluation_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
DECLARE
  v_case synapse.cases%ROWTYPE;
  v_eval synapse.closure_evaluations%ROWTYPE;
  v_actor uuid := synapse.current_user_id();
  v_blocking_count integer;
  v_latest_evaluation_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authenticated actor context is required' USING ERRCODE = '28000'; END IF;
  IF btrim(coalesce(p_reason,''))='' THEN RAISE EXCEPTION 'Disposal reason is required'; END IF;
  SELECT * INTO v_case FROM synapse.cases WHERE case_id=p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Case not found'; END IF;
  SELECT * INTO v_eval FROM synapse.closure_evaluations
    WHERE closure_evaluation_id=p_closure_evaluation_id AND case_id=p_case_id FOR UPDATE;
  IF NOT FOUND OR v_eval.is_final IS NOT TRUE OR v_eval.evaluation_status <> 'PASS' THEN
    RAISE EXCEPTION 'A final PASS closure evaluation is required';
  END IF;
  SELECT e.closure_evaluation_id INTO v_latest_evaluation_id
  FROM synapse.closure_evaluations e
  WHERE e.case_id=p_case_id
  ORDER BY e.evaluated_at DESC,e.closure_evaluation_id DESC
  LIMIT 1;
  IF v_latest_evaluation_id IS DISTINCT FROM p_closure_evaluation_id THEN
    RAISE EXCEPTION 'Disposal requires the latest closure evaluation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM synapse.closure_checklist_versions cv
    WHERE cv.closure_checklist_version_id=v_eval.closure_checklist_version_id
      AND cv.status='APPROVED'
      AND cv.effective_from<=now()
      AND (cv.effective_until IS NULL OR cv.effective_until>now())
  ) THEN RAISE EXCEPTION 'Evaluation must use an effective approved checklist version'; END IF;

  SELECT count(*) INTO v_blocking_count
  FROM synapse.closure_requirements r
  LEFT JOIN synapse.closure_evaluation_items i
    ON i.closure_evaluation_id=v_eval.closure_evaluation_id
   AND i.closure_requirement_id=r.closure_requirement_id
  WHERE r.closure_checklist_version_id=v_eval.closure_checklist_version_id
    AND r.is_mandatory=true AND r.blocks_disposal=true
    AND (
      coalesce(i.result_code,'UNSATISFIED') <> 'SATISFIED'
      OR (r.requirement_type='EVIDENCE' AND (
        i.evidence_item_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM synapse.evidence_items ev
          WHERE ev.evidence_item_id=i.evidence_item_id
            AND (
              ev.case_id=p_case_id
              OR EXISTS (
                SELECT 1 FROM synapse.regulatory_actions ra
                WHERE ra.regulatory_action_id=ev.regulatory_action_id AND ra.case_id=p_case_id
              )
            )
        )
      ))
    )
    AND NOT EXISTS (
      SELECT 1 FROM synapse.closure_exceptions e
      WHERE e.case_id=p_case_id AND e.closure_requirement_id=r.closure_requirement_id
        AND e.exception_status='APPROVED' AND e.approved_by_user_id IS NOT NULL
        AND (e.decided_at IS NOT NULL)
    );
  IF v_blocking_count > 0 THEN
    RAISE EXCEPTION 'Resolution Quality Gate blocked disposal: % mandatory requirement(s) unmet',v_blocking_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM synapse.closure_approvals a
    WHERE a.case_id=p_case_id AND a.closure_evaluation_id=p_closure_evaluation_id
      AND a.decision='APPROVED'
      AND (synapse.is_global_admin() OR synapse.has_scoped_role('BUREAU_HEAD',v_case.lead_bureau_id))
  ) THEN RAISE EXCEPTION 'A designated authority approval is required before disposal'; END IF;

  IF NOT (synapse.is_global_admin() OR synapse.has_scoped_role('BUREAU_HEAD',v_case.lead_bureau_id)) THEN
    RAISE EXCEPTION 'Actor is not authorized to dispose this case' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('synapse.workflow_action','DISPOSE',true);
  UPDATE synapse.cases SET current_status_code='DISPOSED',disposed_at=now()
    WHERE case_id=p_case_id;
  PERFORM set_config('synapse.workflow_action','',true);
  INSERT INTO synapse.case_status_history(case_id,from_status_code,to_status_code,changed_by_user_id,change_reason)
  VALUES (p_case_id,v_case.current_status_code,'DISPOSED',v_actor,p_reason);
  INSERT INTO synapse.audit_events(actor_user_id,event_type,entity_type,entity_id,reason,before_state,after_state)
  VALUES (v_actor,'CASE_DISPOSED','case',p_case_id,p_reason,
    jsonb_build_object('status',v_case.current_status_code),
    jsonb_build_object('status','DISPOSED','closure_evaluation_id',p_closure_evaluation_id));
END;
$function$;

CREATE OR REPLACE FUNCTION synapse.enforce_symmetric_relationship_order()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_directed boolean;
BEGIN
  SELECT is_directed INTO v_directed
  FROM synapse.case_relationship_types
  WHERE relationship_type = NEW.relationship_type;
  IF v_directed = false AND NEW.source_case_id > NEW.target_case_id THEN
    RAISE EXCEPTION 'For symmetric relationships, source_case_id must be <= target_case_id';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION synapse.export_case_metadata(p_case_id uuid)
 RETURNS TABLE(case_id uuid, case_number bigint, institution_id uuid, category_id uuid, lead_bureau_id uuid, current_status_code text, priority_code text, received_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := synapse.current_user_id();
  v_case synapse.cases%ROWTYPE;
  v_authorized boolean;
  v_rows integer;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authenticated actor context is required' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_case FROM synapse.cases c WHERE c.case_id=p_case_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Case not found'; END IF;

  v_authorized := synapse.is_global_admin()
    OR synapse.has_scoped_role('BUREAU_HEAD',v_case.lead_bureau_id)
    OR EXISTS (
      SELECT 1 FROM synapse.case_access_grants g
      WHERE g.case_id=p_case_id AND g.granted_scope='EXPORT'
        AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
        AND g.revoked_at IS NULL
        AND (g.user_id=v_actor OR (g.bureau_id IS NOT NULL AND synapse.is_bureau_member(g.bureau_id)))
    );
  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Explicit export authorization is required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT c.case_id,c.case_number,c.institution_id,c.category_id,c.lead_bureau_id,
           c.current_status_code,c.priority_code,c.received_at
    FROM synapse.cases c WHERE c.case_id=p_case_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  INSERT INTO synapse.audit_events(actor_user_id,event_type,entity_type,entity_id,reason,metadata)
  VALUES (v_actor,'CASE_METADATA_EXPORTED','case',p_case_id,
    'Authorized metadata export',jsonb_build_object('rows_returned',v_rows,'export_scope','METADATA_ONLY'));
END;
$function$;

CREATE OR REPLACE FUNCTION synapse.guard_case_access_grant_write()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_setting('synapse.access_grant_workflow', true) IS DISTINCT FROM 'APPROVE_REQUEST' THEN
    RAISE EXCEPTION 'Direct case access grant writes are prohibited; use approve_case_access_request'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION synapse.guard_case_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.created_by_user_id IS DISTINCT FROM synapse.current_user_id() THEN
    RAISE EXCEPTION 'created_by_user_id must match authenticated actor' USING ERRCODE = '42501';
  END IF;
  IF NEW.current_status_code NOT IN ('DRAFT','NEW') OR NEW.disposed_at IS NOT NULL THEN
    RAISE EXCEPTION 'New cases must start in DRAFT or NEW and cannot be disposed';
  END IF;
  IF NOT (synapse.is_global_admin() OR synapse.is_bureau_member(NEW.lead_bureau_id)) THEN
    RAISE EXCEPTION 'Actor must be an active member of the initial lead Bureau' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION synapse.guard_case_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_action text := current_setting('synapse.workflow_action', true);
BEGIN
  IF v_action IS NULL OR v_action NOT IN ('STATUS_TRANSITION','TRANSFER','DISPOSE') THEN
    RAISE EXCEPTION 'Direct case updates are prohibited; use an authorized workflow function'
      USING ERRCODE = '42501';
  END IF;

  IF v_action = 'STATUS_TRANSITION'
     AND (NEW.lead_bureau_id IS DISTINCT FROM OLD.lead_bureau_id
       OR NEW.accountable_officer_id IS DISTINCT FROM OLD.accountable_officer_id
       OR (NEW.disposed_at IS DISTINCT FROM OLD.disposed_at
           AND NOT (OLD.current_status_code='DISPOSED'
                    AND NEW.current_status_code='REOPENED'
                    AND NEW.disposed_at IS NULL))) THEN
    RAISE EXCEPTION 'Status transition cannot modify ownership or disposal fields';
  END IF;
  IF v_action = 'TRANSFER'
     AND (NEW.current_status_code IS DISTINCT FROM OLD.current_status_code
       OR NEW.disposed_at IS DISTINCT FROM OLD.disposed_at) THEN
    RAISE EXCEPTION 'Transfer cannot modify case status or disposal fields';
  END IF;
  IF v_action = 'DISPOSE'
     AND (NEW.lead_bureau_id IS DISTINCT FROM OLD.lead_bureau_id
       OR NEW.accountable_officer_id IS DISTINCT FROM OLD.accountable_officer_id
       OR NEW.current_status_code <> 'DISPOSED'
       OR NEW.disposed_at IS NULL) THEN
    RAISE EXCEPTION 'Invalid disposal update';
  END IF;
  NEW.updated_at := now();
  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION synapse.guard_submission_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.submission_status <> 'DRAFT' OR NEW.reviewed_at IS NOT NULL OR NEW.reviewed_by_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'New submissions must be unreviewed DRAFT records';
  END IF;
  IF current_user::text <> 'synapse_ingest'
     AND NEW.submitted_by_user_id IS DISTINCT FROM synapse.current_user_id() THEN
    RAISE EXCEPTION 'submitted_by_user_id must match authenticated actor' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION synapse.has_scoped_role(p_role_code text, p_bureau_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
  SELECT synapse.is_global_admin()
    OR EXISTS (
      SELECT 1
      FROM synapse.user_role_assignments ura
      JOIN synapse.roles r ON r.role_id = ura.role_id
      JOIN synapse.users u ON u.user_id = ura.user_id
      WHERE ura.user_id = synapse.current_user_id()
        AND u.account_status = 'ACTIVE'
        AND r.role_code = p_role_code
        AND r.is_active = true
        AND ura.valid_from <= now()
        AND (ura.valid_until IS NULL OR ura.valid_until > now())
        AND (
          (p_bureau_id IS NULL AND ura.scope_type = 'GLOBAL')
          OR (p_bureau_id IS NOT NULL AND
              ((ura.scope_type = 'GLOBAL') OR
               (ura.scope_type = 'BUREAU' AND ura.bureau_id = p_bureau_id)))
        )
    )
$function$;

CREATE OR REPLACE FUNCTION synapse.is_bureau_member(p_bureau_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM synapse.user_bureau_memberships m
    JOIN synapse.users u ON u.user_id = m.user_id
    WHERE m.user_id = synapse.current_user_id()
      AND m.bureau_id = p_bureau_id
      AND m.valid_from <= now()
      AND (m.valid_until IS NULL OR m.valid_until > now())
      AND u.account_status = 'ACTIVE'
  )
$function$;

CREATE OR REPLACE FUNCTION synapse.is_effective_closure_checklist_version(p_version_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM synapse.closure_checklist_versions cv
    WHERE cv.closure_checklist_version_id=p_version_id
      AND cv.status='APPROVED'
      AND cv.effective_from<=now()
      AND (cv.effective_until IS NULL OR cv.effective_until>now())
  )
$function$;

CREATE OR REPLACE FUNCTION synapse.is_global_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM synapse.users u
    WHERE u.user_id = synapse.current_user_id()
      AND u.account_status = 'ACTIVE'
      AND u.is_global_admin = true
  )
$function$;

CREATE OR REPLACE FUNCTION synapse.prevent_dependency_cycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
DECLARE v_cycle boolean;
BEGIN
  IF NEW.relationship_type='DEPENDS_ON' AND NEW.relationship_status='CONFIRMED' THEN
    PERFORM pg_advisory_xact_lock(730241, 9917);
    IF NEW.source_case_id=NEW.target_case_id THEN
      RAISE EXCEPTION 'Dependency relationship cannot reference itself';
    END IF;
    WITH RECURSIVE reachable(case_id) AS (
      SELECT NEW.target_case_id
      UNION
      SELECT cr.target_case_id
      FROM synapse.case_relationships cr
      JOIN reachable r ON cr.source_case_id=r.case_id
      WHERE cr.relationship_type='DEPENDS_ON'
        AND cr.relationship_status='CONFIRMED'
        AND (TG_OP='INSERT' OR cr.case_relationship_id <> NEW.case_relationship_id)
    )
    SELECT EXISTS(SELECT 1 FROM reachable WHERE case_id=NEW.source_case_id) INTO v_cycle;
    IF v_cycle THEN RAISE EXCEPTION 'Confirmed DEPENDS_ON relationship would create a cycle'; END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION synapse.reject_audit_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$function$;

CREATE OR REPLACE FUNCTION synapse.reject_case_transfer(p_transfer_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
DECLARE
  v_transfer synapse.case_transfers%ROWTYPE;
  v_side text;
BEGIN
  SELECT * INTO v_transfer FROM synapse.case_transfers WHERE case_transfer_id=p_transfer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF synapse.is_global_admin() THEN
    v_side := 'SOURCE';
  ELSIF synapse.has_scoped_role('BUREAU_HEAD',v_transfer.from_bureau_id) THEN
    v_side := 'SOURCE';
  ELSIF synapse.has_scoped_role('BUREAU_HEAD',v_transfer.to_bureau_id) THEN
    v_side := 'TARGET';
  ELSE
    RAISE EXCEPTION 'Only source/target Bureau Head or global administrator may reject a transfer'
      USING ERRCODE = '42501';
  END IF;
  PERFORM synapse.decide_case_transfer(p_transfer_id,v_side,'REJECTED',p_reason);
END;
$function$;

CREATE OR REPLACE FUNCTION synapse.request_case_access(p_case_id uuid, p_scope text, p_reason text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := synapse.current_user_id();
  v_request_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authenticated actor context is required' USING ERRCODE = '28000'; END IF;
  IF p_scope NOT IN ('DISCOVER','DETAILS','DOCUMENTS','COORDINATE','EXPORT') THEN
    RAISE EXCEPTION 'Invalid access scope';
  END IF;
  IF btrim(coalesce(p_reason,''))='' THEN RAISE EXCEPTION 'Access request reason is required'; END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at<=now() THEN RAISE EXCEPTION 'Expiry must be in the future'; END IF;
  IF NOT synapse.can_discover_case(p_case_id) THEN
    RAISE EXCEPTION 'Case cannot be discovered by this user' USING ERRCODE = '42501';
  END IF;
  INSERT INTO synapse.case_access_requests(
    case_id,requester_user_id,requested_scope,reason,expires_at,request_status
  ) VALUES (p_case_id,v_actor,p_scope,p_reason,p_expires_at,'PENDING')
  RETURNING case_access_request_id INTO v_request_id;
  INSERT INTO synapse.audit_events(actor_user_id,event_type,entity_type,entity_id,reason,after_state)
  VALUES (v_actor,'CASE_ACCESS_REQUESTED','case_access_request',v_request_id,p_reason,
    jsonb_build_object('case_id',p_case_id,'scope',p_scope,'expires_at',p_expires_at));
  RETURN v_request_id;
END;
$function$;

CREATE OR REPLACE FUNCTION synapse.request_case_transfer(p_case_id uuid, p_to_bureau_id uuid, p_to_officer_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
DECLARE
  v_case synapse.cases%ROWTYPE;
  v_actor uuid := synapse.current_user_id();
  v_transfer_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authenticated actor context is required' USING ERRCODE = '28000'; END IF;
  IF btrim(coalesce(p_reason,''))='' THEN RAISE EXCEPTION 'Transfer reason is required'; END IF;
  SELECT * INTO v_case FROM synapse.cases WHERE case_id=p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Case not found'; END IF;
  IF p_to_bureau_id=v_case.lead_bureau_id THEN RAISE EXCEPTION 'Target Bureau must differ from current lead Bureau'; END IF;
  IF NOT (synapse.is_global_admin()
      OR synapse.is_bureau_member(v_case.lead_bureau_id)
      OR v_case.accountable_officer_id=v_actor) THEN
    RAISE EXCEPTION 'Only the owning Bureau or accountable officer may request transfer' USING ERRCODE = '42501';
  END IF;
  IF p_to_officer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM synapse.user_bureau_memberships m
    WHERE m.user_id=p_to_officer_id AND m.bureau_id=p_to_bureau_id
      AND m.valid_from<=now() AND (m.valid_until IS NULL OR m.valid_until>now())
  ) THEN RAISE EXCEPTION 'Target officer is not an active member of target Bureau'; END IF;
  INSERT INTO synapse.case_transfers(
    case_id,from_bureau_id,to_bureau_id,from_officer_id,to_officer_id,
    requested_by_user_id,transfer_status,reason
  ) VALUES (
    p_case_id,v_case.lead_bureau_id,p_to_bureau_id,v_case.accountable_officer_id,
    p_to_officer_id,v_actor,'REQUESTED',p_reason
  ) RETURNING case_transfer_id INTO v_transfer_id;
  INSERT INTO synapse.audit_events(actor_user_id,event_type,entity_type,entity_id,reason,after_state)
  VALUES (v_actor,'CASE_TRANSFER_REQUESTED','case_transfer',v_transfer_id,p_reason,
    jsonb_build_object('case_id',p_case_id,'from_bureau_id',v_case.lead_bureau_id,'to_bureau_id',p_to_bureau_id));
  RETURN v_transfer_id;
END;
$function$;

CREATE OR REPLACE FUNCTION synapse.request_closure_exception(p_case_id uuid, p_requirement_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
DECLARE
  v_case synapse.cases%ROWTYPE;
  v_actor uuid := synapse.current_user_id();
  v_exception_id uuid;
  v_valid boolean;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authenticated actor context is required' USING ERRCODE = '28000'; END IF;
  IF btrim(coalesce(p_reason,''))='' THEN RAISE EXCEPTION 'Exception reason is required'; END IF;
  SELECT * INTO v_case FROM synapse.cases WHERE case_id=p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Case not found'; END IF;
  IF NOT (synapse.is_global_admin() OR synapse.is_bureau_member(v_case.lead_bureau_id)
      OR v_case.accountable_officer_id=v_actor) THEN
    RAISE EXCEPTION 'Not authorized to request an exception for this case' USING ERRCODE = '42501';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM synapse.closure_requirements r
    JOIN synapse.closure_evaluations e
      ON e.closure_checklist_version_id=r.closure_checklist_version_id
    WHERE r.closure_requirement_id=p_requirement_id
      AND e.case_id=p_case_id
  ) INTO v_valid;
  IF NOT v_valid THEN RAISE EXCEPTION 'Requirement is not part of a checklist evaluated for this case'; END IF;
  INSERT INTO synapse.closure_exceptions(case_id,closure_requirement_id,requested_by_user_id,reason)
  VALUES (p_case_id,p_requirement_id,v_actor,p_reason)
  RETURNING closure_exception_id INTO v_exception_id;
  INSERT INTO synapse.audit_events(actor_user_id,event_type,entity_type,entity_id,reason)
  VALUES (v_actor,'CLOSURE_EXCEPTION_REQUESTED','closure_exception',v_exception_id,p_reason);
  RETURN v_exception_id;
END;
$function$;

CREATE OR REPLACE FUNCTION synapse.review_case_relationship(p_relationship_id uuid, p_decision text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
DECLARE
  v_rel synapse.case_relationships%ROWTYPE;
  v_source_bureau uuid;
  v_target_bureau uuid;
  v_actor uuid := synapse.current_user_id();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authenticated actor context is required' USING ERRCODE = '28000'; END IF;
  IF p_decision NOT IN ('CONFIRMED','REJECTED') OR btrim(coalesce(p_reason,''))='' THEN
    RAISE EXCEPTION 'Valid relationship decision and reason are required';
  END IF;
  SELECT * INTO v_rel FROM synapse.case_relationships
    WHERE case_relationship_id=p_relationship_id FOR UPDATE;
  IF NOT FOUND OR v_rel.relationship_status <> 'PROPOSED' THEN
    RAISE EXCEPTION 'Relationship not found or already reviewed';
  END IF;
  SELECT lead_bureau_id INTO v_source_bureau FROM synapse.cases WHERE case_id=v_rel.source_case_id;
  SELECT lead_bureau_id INTO v_target_bureau FROM synapse.cases WHERE case_id=v_rel.target_case_id;
  IF NOT (synapse.is_global_admin()
      OR synapse.has_scoped_role('BUREAU_HEAD',v_source_bureau)
      OR synapse.has_scoped_role('BUREAU_HEAD',v_target_bureau)) THEN
    RAISE EXCEPTION 'Only a Bureau Head for either case or global administrator may review this relationship'
      USING ERRCODE = '42501';
  END IF;
  UPDATE synapse.case_relationships
    SET relationship_status=p_decision,reviewed_by_user_id=v_actor,reviewed_at=now(),rationale=coalesce(rationale,'') || E'\\nReview: ' || p_reason
    WHERE case_relationship_id=p_relationship_id;
  INSERT INTO synapse.audit_events(actor_user_id,event_type,entity_type,entity_id,reason,after_state)
  VALUES (v_actor,'CASE_RELATIONSHIP_REVIEWED','case_relationship',p_relationship_id,p_reason,
    jsonb_build_object('decision',p_decision,'source_case_id',v_rel.source_case_id,'target_case_id',v_rel.target_case_id));
END;
$function$;

CREATE OR REPLACE FUNCTION synapse.submission_linked_case_documents_visible(p_submission_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM synapse.submission_case_links l
    WHERE l.submission_id=p_submission_id
      AND synapse.can_view_documents_for_case(l.case_id)
  )
$function$;

CREATE OR REPLACE FUNCTION synapse.submission_linked_case_visible(p_submission_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM synapse.submission_case_links l
    WHERE l.submission_id=p_submission_id
      AND synapse.can_view_case(l.case_id)
  )
$function$;

CREATE OR REPLACE FUNCTION synapse.transition_case_status(p_case_id uuid, p_to_status text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'synapse', 'pg_temp'
AS $function$
DECLARE
  v_case synapse.cases%ROWTYPE;
  v_actor uuid := synapse.current_user_id();
  v_allowed boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authenticated actor context is required' USING ERRCODE = '28000';
  END IF;
  IF btrim(coalesce(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'A status-change reason is required';
  END IF;

  SELECT * INTO v_case FROM synapse.cases WHERE case_id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Case not found'; END IF;
  IF NOT (synapse.is_global_admin()
      OR synapse.has_scoped_role('BUREAU_HEAD', v_case.lead_bureau_id)
      OR synapse.has_scoped_role('CASE_OFFICER', v_case.lead_bureau_id)
      OR v_case.accountable_officer_id = v_actor) THEN
    RAISE EXCEPTION 'Not authorized to change this case status' USING ERRCODE = '42501';
  END IF;
  IF p_to_status = 'DISPOSED' THEN
    RAISE EXCEPTION 'Use dispose_case after passing the Resolution Quality Gate';
  END IF;
  IF p_to_status = 'REOPENED'
     AND NOT (synapse.is_global_admin() OR synapse.has_scoped_role('BUREAU_HEAD', v_case.lead_bureau_id)) THEN
    RAISE EXCEPTION 'Only an authorized Bureau Head or global administrator may reopen a case'
      USING ERRCODE = '42501';
  END IF;

  v_allowed := CASE v_case.current_status_code
    WHEN 'DRAFT' THEN p_to_status IN ('NEW')
    WHEN 'NEW' THEN p_to_status IN ('ASSIGNED','UNDER_REVIEW')
    WHEN 'ASSIGNED' THEN p_to_status IN ('UNDER_REVIEW','AWAITING_INFORMATION','ACTION_INITIATED','ESCALATED')
    WHEN 'UNDER_REVIEW' THEN p_to_status IN ('AWAITING_INFORMATION','ACTION_INITIATED','ESCALATED')
    WHEN 'AWAITING_INFORMATION' THEN p_to_status IN ('UNDER_REVIEW','ACTION_INITIATED','ESCALATED')
    WHEN 'ACTION_INITIATED' THEN p_to_status IN ('UNDER_REVIEW','ESCALATED')
    WHEN 'ESCALATED' THEN p_to_status IN ('UNDER_REVIEW','ACTION_INITIATED')
    WHEN 'DISPOSED' THEN p_to_status = 'REOPENED'
    WHEN 'REOPENED' THEN p_to_status IN ('ASSIGNED','UNDER_REVIEW')
    ELSE false
  END;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Invalid case status transition: % -> %', v_case.current_status_code, p_to_status;
  END IF;

  PERFORM set_config('synapse.workflow_action','STATUS_TRANSITION',true);
  UPDATE synapse.cases
    SET current_status_code = p_to_status,
        disposed_at = NULL
    WHERE case_id = p_case_id;
  PERFORM set_config('synapse.workflow_action','',true);

  INSERT INTO synapse.case_status_history(
    case_id,from_status_code,to_status_code,changed_by_user_id,change_reason
  ) VALUES (p_case_id,v_case.current_status_code,p_to_status,v_actor,p_reason);
  INSERT INTO synapse.audit_events(actor_user_id,event_type,entity_type,entity_id,reason,before_state,after_state)
  VALUES (v_actor,'CASE_STATUS_CHANGED','case',p_case_id,p_reason,
    jsonb_build_object('status',v_case.current_status_code),
    jsonb_build_object('status',p_to_status));
END;
$function$;

CREATE VIEW "synapse"."case_discovery" WITH (security_barrier=true) AS SELECT case_id,
    case_number,
    institution_id,
    category_id,
    lead_bureau_id,
    current_status_code,
    priority_code,
    received_at
   FROM synapse.cases c
  WHERE synapse.can_discover_case(case_id);

CREATE TRIGGER audit_events_no_update_delete BEFORE DELETE OR UPDATE ON synapse.audit_events FOR EACH ROW EXECUTE FUNCTION synapse.reject_audit_mutation();

CREATE TRIGGER case_access_grants_guard_write BEFORE INSERT OR DELETE OR UPDATE ON synapse.case_access_grants FOR EACH ROW EXECUTE FUNCTION synapse.guard_case_access_grant_write();

CREATE TRIGGER case_relationship_dependency_cycle BEFORE INSERT OR UPDATE OF source_case_id, target_case_id, relationship_type, relationship_status ON synapse.case_relationships FOR EACH ROW EXECUTE FUNCTION synapse.prevent_dependency_cycle();

CREATE TRIGGER case_relationship_symmetric_order BEFORE INSERT OR UPDATE OF source_case_id, target_case_id, relationship_type ON synapse.case_relationships FOR EACH ROW EXECUTE FUNCTION synapse.enforce_symmetric_relationship_order();

CREATE TRIGGER submissions_guard_insert BEFORE INSERT ON synapse.case_submissions FOR EACH ROW EXECUTE FUNCTION synapse.guard_submission_insert();

CREATE TRIGGER cases_guard_insert BEFORE INSERT ON synapse.cases FOR EACH ROW EXECUTE FUNCTION synapse.guard_case_insert();

CREATE TRIGGER cases_guard_update BEFORE UPDATE ON synapse.cases FOR EACH ROW EXECUTE FUNCTION synapse.guard_case_update();

CREATE POLICY "access_grant_approvals_select" ON "synapse"."case_access_grant_approvals" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((synapse.is_global_admin() OR (approver_user_id = synapse.current_user_id()) OR (EXISTS ( SELECT 1
   FROM synapse.cases c
  WHERE ((c.case_id = case_access_grant_approvals.case_id) AND synapse.is_bureau_member(c.lead_bureau_id))))));

CREATE POLICY "access_grants_insert_authorized" ON "synapse"."case_access_grants" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((synapse.is_global_admin() OR (EXISTS ( SELECT 1
   FROM synapse.cases c
  WHERE ((c.case_id = case_access_grants.case_id) AND synapse.is_bureau_member(c.lead_bureau_id))))));

CREATE POLICY "access_grants_select_authorized" ON "synapse"."case_access_grants" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((synapse.is_global_admin() OR (user_id = synapse.current_user_id()) OR (granted_by_user_id = synapse.current_user_id()) OR ((bureau_id IS NOT NULL) AND synapse.is_bureau_member(bureau_id))));

CREATE POLICY "access_grants_update_authorized" ON "synapse"."case_access_grants" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((synapse.is_global_admin() OR (granted_by_user_id = synapse.current_user_id()))) WITH CHECK ((synapse.is_global_admin() OR (granted_by_user_id = synapse.current_user_id())));

CREATE POLICY "access_requests_insert_authorized" ON "synapse"."case_access_requests" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((requester_user_id = synapse.current_user_id()) AND synapse.can_discover_case(case_id)));

CREATE POLICY "access_requests_select_authorized" ON "synapse"."case_access_requests" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((synapse.is_global_admin() OR (requester_user_id = synapse.current_user_id()) OR (EXISTS ( SELECT 1
   FROM synapse.cases c
  WHERE ((c.case_id = case_access_requests.case_id) AND synapse.is_bureau_member(c.lead_bureau_id))))));

CREATE POLICY "access_requests_update_authorized" ON "synapse"."case_access_requests" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((synapse.is_global_admin() OR (EXISTS ( SELECT 1
   FROM synapse.cases c
  WHERE ((c.case_id = case_access_requests.case_id) AND synapse.is_bureau_member(c.lead_bureau_id)))))) WITH CHECK ((synapse.is_global_admin() OR (EXISTS ( SELECT 1
   FROM synapse.cases c
  WHERE ((c.case_id = case_access_requests.case_id) AND synapse.is_bureau_member(c.lead_bureau_id))))));

CREATE POLICY "case_comments_insert_authorized" ON "synapse"."case_comments" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((author_user_id = synapse.current_user_id()) AND synapse.can_view_case(case_id)));

CREATE POLICY "case_comments_select_authorized" ON "synapse"."case_comments" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((synapse.can_view_case(case_id) AND ((visibility <> 'LEAD_BUREAU_ONLY'::text) OR synapse.is_bureau_member(( SELECT c.lead_bureau_id
   FROM synapse.cases c
  WHERE (c.case_id = case_comments.case_id))))));

CREATE POLICY "case_relationships_insert_proposed" ON "synapse"."case_relationships" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((relationship_status = 'PROPOSED'::text) AND (proposed_by_user_id = synapse.current_user_id()) AND synapse.can_view_case(source_case_id) AND synapse.can_view_case(target_case_id)));

CREATE POLICY "case_relationships_select_authorized" ON "synapse"."case_relationships" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((synapse.is_global_admin() OR (synapse.can_view_case(source_case_id) AND synapse.can_view_case(target_case_id))));

CREATE POLICY "submissions_insert_authorized" ON "synapse"."case_submissions" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((((CURRENT_USER)::text = 'synapse_ingest'::text) OR synapse.is_global_admin() OR (submitted_by_user_id = synapse.current_user_id())));

CREATE POLICY "submissions_select_authorized" ON "synapse"."case_submissions" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((CURRENT_USER)::text = 'synapse_ingest'::text) OR synapse.is_global_admin() OR (submitted_by_user_id = synapse.current_user_id()) OR synapse.submission_linked_case_visible(submission_id)));

CREATE POLICY "transfer_approvals_select" ON "synapse"."case_transfer_approvals" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((synapse.is_global_admin() OR (approver_user_id = synapse.current_user_id()) OR (EXISTS ( SELECT 1
   FROM synapse.case_transfers t
  WHERE ((t.case_transfer_id = case_transfer_approvals.case_transfer_id) AND (synapse.is_bureau_member(t.from_bureau_id) OR synapse.is_bureau_member(t.to_bureau_id)))))));

CREATE POLICY "case_transfers_select_authorized" ON "synapse"."case_transfers" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((synapse.is_global_admin() OR synapse.is_bureau_member(from_bureau_id) OR synapse.is_bureau_member(to_bureau_id) OR synapse.can_view_case(case_id)));

CREATE POLICY "case_work_items_insert_authorized" ON "synapse"."case_work_items" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((created_by_user_id = synapse.current_user_id()) AND (synapse.is_global_admin() OR synapse.is_bureau_member(bureau_id)) AND synapse.can_view_case(case_id)));

CREATE POLICY "case_work_items_select_authorized" ON "synapse"."case_work_items" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((synapse.is_global_admin() OR (assigned_to_user_id = synapse.current_user_id()) OR synapse.is_bureau_member(bureau_id) OR synapse.can_view_case(case_id)));

CREATE POLICY "case_work_items_update_authorized" ON "synapse"."case_work_items" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((synapse.is_global_admin() OR (assigned_to_user_id = synapse.current_user_id()) OR synapse.is_bureau_member(bureau_id))) WITH CHECK ((synapse.is_global_admin() OR (assigned_to_user_id = synapse.current_user_id()) OR synapse.is_bureau_member(bureau_id)));

CREATE POLICY "cases_insert_authorized" ON "synapse"."cases" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((created_by_user_id = synapse.current_user_id()) AND (current_status_code = ANY (ARRAY['DRAFT'::text, 'NEW'::text])) AND (disposed_at IS NULL) AND (synapse.is_global_admin() OR synapse.is_bureau_member(lead_bureau_id))));

CREATE POLICY "cases_select_authorized" ON "synapse"."cases" AS PERMISSIVE FOR SELECT TO PUBLIC USING (synapse.can_view_case(case_id));

CREATE POLICY "cases_update_authorized" ON "synapse"."cases" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((synapse.is_global_admin() OR synapse.is_bureau_member(lead_bureau_id) OR (accountable_officer_id = synapse.current_user_id()))) WITH CHECK ((synapse.is_global_admin() OR synapse.is_bureau_member(lead_bureau_id) OR (accountable_officer_id = synapse.current_user_id())));

CREATE POLICY "closure_evaluation_items_insert_authorized" ON "synapse"."closure_evaluation_items" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((EXISTS ( SELECT 1
   FROM (synapse.closure_evaluations e
     JOIN synapse.closure_requirements r ON (((r.closure_requirement_id = closure_evaluation_items.closure_requirement_id) AND (r.closure_checklist_version_id = e.closure_checklist_version_id))))
  WHERE ((e.closure_evaluation_id = closure_evaluation_items.closure_evaluation_id) AND (e.evaluated_by_user_id = synapse.current_user_id()) AND synapse.can_view_case(e.case_id)))));

CREATE POLICY "closure_evaluation_items_select_authorized" ON "synapse"."closure_evaluation_items" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM synapse.closure_evaluations e
  WHERE ((e.closure_evaluation_id = closure_evaluation_items.closure_evaluation_id) AND synapse.can_view_case(e.case_id)))));

CREATE POLICY "closure_evaluations_insert_authorized" ON "synapse"."closure_evaluations" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((evaluated_by_user_id = synapse.current_user_id()) AND synapse.can_view_case(case_id) AND synapse.is_effective_closure_checklist_version(closure_checklist_version_id)));

CREATE POLICY "closure_evaluations_select_authorized" ON "synapse"."closure_evaluations" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((synapse.is_global_admin() OR synapse.can_view_case(case_id)));

CREATE POLICY "closure_exceptions_select_authorized" ON "synapse"."closure_exceptions" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((synapse.is_global_admin() OR (EXISTS ( SELECT 1
   FROM synapse.cases c
  WHERE ((c.case_id = closure_exceptions.case_id) AND synapse.can_view_case(c.case_id))))));

CREATE POLICY "document_versions_insert_authorized" ON "synapse"."document_versions" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((((CURRENT_USER)::text = 'synapse_ingest'::text) AND (EXISTS ( SELECT 1
   FROM synapse.documents d
  WHERE ((d.document_id = document_versions.document_id) AND (d.owner_submission_id IS NOT NULL) AND (d.owner_case_id IS NULL))))) OR ((uploaded_by_user_id = synapse.current_user_id()) AND (EXISTS ( SELECT 1
   FROM synapse.documents d
  WHERE ((d.document_id = document_versions.document_id) AND (((d.owner_case_id IS NOT NULL) AND synapse.can_view_documents_for_case(d.owner_case_id)) OR ((d.owner_submission_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM synapse.case_submissions s
          WHERE ((s.submission_id = d.owner_submission_id) AND (s.submitted_by_user_id = synapse.current_user_id()))))))))))));

CREATE POLICY "document_versions_select_authorized" ON "synapse"."document_versions" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((CURRENT_USER)::text = 'synapse_ingest'::text) OR synapse.is_global_admin() OR (EXISTS ( SELECT 1
   FROM synapse.documents d
  WHERE ((d.document_id = document_versions.document_id) AND (d.owner_submission_id IS NOT NULL) AND (d.uploaded_by_user_id = synapse.current_user_id())))) OR (EXISTS ( SELECT 1
   FROM synapse.documents d
  WHERE ((d.document_id = document_versions.document_id) AND (((d.owner_case_id IS NOT NULL) AND synapse.can_view_documents_for_case(d.owner_case_id)) OR ((d.owner_submission_id IS NOT NULL) AND synapse.submission_linked_case_documents_visible(d.owner_submission_id))))))));

CREATE POLICY "documents_insert_authorized" ON "synapse"."documents" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((((CURRENT_USER)::text = 'synapse_ingest'::text) AND (owner_submission_id IS NOT NULL) AND (owner_case_id IS NULL)) OR ((uploaded_by_user_id = synapse.current_user_id()) AND (((owner_case_id IS NOT NULL) AND synapse.can_view_documents_for_case(owner_case_id)) OR ((owner_submission_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM synapse.case_submissions s
  WHERE ((s.submission_id = documents.owner_submission_id) AND ((s.submitted_by_user_id = synapse.current_user_id()) OR ((CURRENT_USER)::text = 'synapse_ingest'::text))))))))));

CREATE POLICY "documents_select_authorized" ON "synapse"."documents" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((CURRENT_USER)::text = 'synapse_ingest'::text) OR synapse.is_global_admin() OR ((owner_submission_id IS NOT NULL) AND (uploaded_by_user_id = synapse.current_user_id())) OR ((owner_case_id IS NOT NULL) AND synapse.can_view_documents_for_case(owner_case_id)) OR ((owner_submission_id IS NOT NULL) AND synapse.submission_linked_case_documents_visible(owner_submission_id))));

CREATE POLICY "evidence_items_insert_authorized" ON "synapse"."evidence_items" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((((case_id IS NOT NULL) AND synapse.can_view_documents_for_case(case_id) AND (EXISTS ( SELECT 1
   FROM (synapse.document_versions dv
     JOIN synapse.documents d ON ((d.document_id = dv.document_id)))
  WHERE ((dv.document_version_id = evidence_items.document_version_id) AND (d.owner_case_id = evidence_items.case_id) AND synapse.can_view_documents_for_case(evidence_items.case_id))))) OR ((regulatory_action_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ((synapse.regulatory_actions ra
     JOIN synapse.documents d ON ((d.owner_case_id = ra.case_id)))
     JOIN synapse.document_versions dv ON ((dv.document_id = d.document_id)))
  WHERE ((ra.regulatory_action_id = evidence_items.regulatory_action_id) AND (ra.case_id IS NOT NULL) AND (dv.document_version_id = evidence_items.document_version_id) AND synapse.can_view_documents_for_case(ra.case_id)))))));

CREATE POLICY "evidence_items_select_authorized" ON "synapse"."evidence_items" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((synapse.is_global_admin() OR ((case_id IS NOT NULL) AND synapse.can_view_documents_for_case(case_id)) OR (EXISTS ( SELECT 1
   FROM synapse.regulatory_actions ra
  WHERE ((ra.regulatory_action_id = evidence_items.regulatory_action_id) AND (ra.case_id IS NOT NULL) AND synapse.can_view_documents_for_case(ra.case_id))))));

ALTER TABLE "synapse"."case_access_grant_approvals" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "synapse"."case_access_grants" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "synapse"."case_access_requests" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "synapse"."case_comments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "synapse"."case_relationships" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "synapse"."case_submissions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "synapse"."case_transfer_approvals" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "synapse"."case_transfers" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "synapse"."case_work_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "synapse"."cases" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "synapse"."closure_evaluation_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "synapse"."closure_evaluations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "synapse"."closure_exceptions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "synapse"."document_versions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "synapse"."documents" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "synapse"."evidence_items" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA "synapse" FROM PUBLIC;

REVOKE ALL ON ALL TABLES IN SCHEMA "synapse" FROM PUBLIC;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "synapse" FROM PUBLIC;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA "synapse" FROM PUBLIC;

GRANT EXECUTE ON FUNCTION synapse.approve_case_access_request(uuid,text,text,timestamp with time zone) TO "synapse_app";

GRANT EXECUTE ON FUNCTION synapse.approve_case_closure(uuid,uuid,text,text) TO "synapse_app";

GRANT EXECUTE ON FUNCTION synapse.can_discover_case(uuid) TO "synapse_app";

GRANT EXECUTE ON FUNCTION synapse.can_view_case(uuid) TO "synapse_app";

GRANT EXECUTE ON FUNCTION synapse.can_view_case(uuid) TO "synapse_ingest";

GRANT EXECUTE ON FUNCTION synapse.can_view_documents_for_case(uuid) TO "synapse_app";

GRANT EXECUTE ON FUNCTION synapse.can_view_documents_for_case(uuid) TO "synapse_ingest";

GRANT EXECUTE ON FUNCTION synapse.complete_case_transfer(uuid) TO "synapse_app";

GRANT EXECUTE ON FUNCTION synapse.current_user_id() TO "synapse_app";

GRANT EXECUTE ON FUNCTION synapse.current_user_id() TO "synapse_ingest";

GRANT EXECUTE ON FUNCTION synapse.decide_case_transfer(uuid,text,text,text) TO "synapse_app";

GRANT EXECUTE ON FUNCTION synapse.decide_closure_exception(uuid,text,text) TO "synapse_app";

GRANT EXECUTE ON FUNCTION synapse.dispose_case(uuid,uuid,text) TO "synapse_app";

GRANT EXECUTE ON FUNCTION synapse.export_case_metadata(uuid) TO "synapse_app";

GRANT EXECUTE ON FUNCTION synapse.has_scoped_role(text,uuid) TO "synapse_app";

GRANT EXECUTE ON FUNCTION synapse.is_bureau_member(uuid) TO "synapse_app";

GRANT EXECUTE ON FUNCTION synapse.is_bureau_member(uuid) TO "synapse_ingest";

GRANT EXECUTE ON FUNCTION synapse.is_effective_closure_checklist_version(uuid) TO "synapse_app";

GRANT EXECUTE ON FUNCTION synapse.is_global_admin() TO "synapse_app";

GRANT EXECUTE ON FUNCTION synapse.is_global_admin() TO "synapse_ingest";

GRANT EXECUTE ON FUNCTION synapse.reject_case_transfer(uuid,text) TO "synapse_app";

GRANT EXECUTE ON FUNCTION synapse.request_case_access(uuid,text,text,timestamp with time zone) TO "synapse_app";

GRANT EXECUTE ON FUNCTION synapse.request_case_transfer(uuid,uuid,uuid,text) TO "synapse_app";

GRANT EXECUTE ON FUNCTION synapse.request_closure_exception(uuid,uuid,text) TO "synapse_app";

GRANT EXECUTE ON FUNCTION synapse.review_case_relationship(uuid,text,text) TO "synapse_app";

GRANT EXECUTE ON FUNCTION synapse.submission_linked_case_documents_visible(uuid) TO "synapse_app";

GRANT EXECUTE ON FUNCTION synapse.submission_linked_case_documents_visible(uuid) TO "synapse_ingest";

GRANT EXECUTE ON FUNCTION synapse.submission_linked_case_visible(uuid) TO "synapse_app";

GRANT EXECUTE ON FUNCTION synapse.submission_linked_case_visible(uuid) TO "synapse_ingest";

GRANT EXECUTE ON FUNCTION synapse.transition_case_status(uuid,text,text) TO "synapse_app";

GRANT USAGE ON SCHEMA synapse TO "synapse_app";

GRANT USAGE ON SCHEMA synapse TO "synapse_ingest";

GRANT SELECT ON TABLE synapse.bureaus TO "synapse_app";

GRANT SELECT ON TABLE synapse.case_access_grant_approvals TO "synapse_app";

GRANT SELECT ON TABLE synapse.case_access_grants TO "synapse_app";

GRANT SELECT ON TABLE synapse.case_access_requests TO "synapse_app";

GRANT SELECT ON TABLE synapse.case_categories TO "synapse_app";

GRANT INSERT ON TABLE synapse.case_comments TO "synapse_app";

GRANT SELECT ON TABLE synapse.case_comments TO "synapse_app";

GRANT SELECT ON TABLE synapse.case_discovery TO "synapse_app";

GRANT INSERT ON TABLE synapse.case_relationships TO "synapse_app";

GRANT SELECT ON TABLE synapse.case_relationships TO "synapse_app";

GRANT SELECT ON TABLE synapse.case_statuses TO "synapse_app";

GRANT INSERT ON TABLE synapse.case_submissions TO "synapse_app";

GRANT SELECT ON TABLE synapse.case_submissions TO "synapse_app";

GRANT INSERT ON TABLE synapse.case_submissions TO "synapse_ingest";

GRANT SELECT ON TABLE synapse.case_submissions TO "synapse_ingest";

GRANT SELECT ON TABLE synapse.case_transfer_approvals TO "synapse_app";

GRANT SELECT ON TABLE synapse.case_transfers TO "synapse_app";

GRANT INSERT ON TABLE synapse.case_work_items TO "synapse_app";

GRANT SELECT ON TABLE synapse.case_work_items TO "synapse_app";

GRANT UPDATE ON TABLE synapse.case_work_items TO "synapse_app";

GRANT INSERT ON TABLE synapse.cases TO "synapse_app";

GRANT SELECT ON TABLE synapse.cases TO "synapse_app";

GRANT SELECT ON TABLE synapse.closure_checklist_versions TO "synapse_app";

GRANT SELECT ON TABLE synapse.closure_checklists TO "synapse_app";

GRANT INSERT ON TABLE synapse.closure_evaluation_items TO "synapse_app";

GRANT SELECT ON TABLE synapse.closure_evaluation_items TO "synapse_app";

GRANT INSERT ON TABLE synapse.closure_evaluations TO "synapse_app";

GRANT SELECT ON TABLE synapse.closure_evaluations TO "synapse_app";

GRANT SELECT ON TABLE synapse.closure_exceptions TO "synapse_app";

GRANT SELECT ON TABLE synapse.closure_requirements TO "synapse_app";

GRANT INSERT ON TABLE synapse.document_versions TO "synapse_app";

GRANT SELECT ON TABLE synapse.document_versions TO "synapse_app";

GRANT INSERT ON TABLE synapse.document_versions TO "synapse_ingest";

GRANT SELECT ON TABLE synapse.document_versions TO "synapse_ingest";

GRANT INSERT ON TABLE synapse.documents TO "synapse_app";

GRANT SELECT ON TABLE synapse.documents TO "synapse_app";

GRANT INSERT ON TABLE synapse.documents TO "synapse_ingest";

GRANT SELECT ON TABLE synapse.documents TO "synapse_ingest";

GRANT INSERT ON TABLE synapse.evidence_items TO "synapse_app";

GRANT SELECT ON TABLE synapse.evidence_items TO "synapse_app";

GRANT INSERT ON TABLE synapse.inbound_messages TO "synapse_ingest";

GRANT SELECT ON TABLE synapse.inbound_messages TO "synapse_ingest";

GRANT INSERT ON TABLE synapse.integration_events TO "synapse_ingest";

GRANT SELECT ON TABLE synapse.integration_events TO "synapse_ingest";

GRANT SELECT ON TABLE synapse.integration_sources TO "synapse_ingest";

GRANT SELECT ON TABLE synapse.regions TO "synapse_app";

INSERT INTO "synapse"."roles" ("role_id", "is_active", "role_code", "role_name", "description", "is_system_role") VALUES ('742ccf2d-0495-472b-899c-548846afde07', true, 'AUDITOR', 'Auditor', 'Read-only audit and compliance review.', true);

INSERT INTO "synapse"."roles" ("role_id", "is_active", "role_code", "role_name", "description", "is_system_role") VALUES ('f5baccca-41a2-4124-b35c-15ee61d04b51', true, 'BUREAU_HEAD', 'Bureau Head', 'Bureau oversight, approvals and case coordination.', true);

INSERT INTO "synapse"."roles" ("role_id", "is_active", "role_code", "role_name", "description", "is_system_role") VALUES ('b1221b4f-72a0-438d-8f46-c9af188d2451', true, 'CASE_OFFICER', 'Case Officer', 'Authorized case processing and work items.', true);

INSERT INTO "synapse"."roles" ("role_id", "is_active", "role_code", "role_name", "description", "is_system_role") VALUES ('56d4567d-4ede-4b84-bb52-200ab93c23bd', true, 'REVIEWER', 'Reviewer', 'Review drafts, matching findings and closure checks.', true);

INSERT INTO "synapse"."roles" ("role_id", "is_active", "role_code", "role_name", "description", "is_system_role") VALUES ('1d193671-9222-4526-82d7-e03b85e972c1', true, 'SENIOR_MANAGEMENT', 'Senior Management', 'Cross-bureau oversight and approved analytics.', true);

INSERT INTO "synapse"."roles" ("role_id", "is_active", "role_code", "role_name", "description", "is_system_role") VALUES ('26ba1600-c999-4ae9-8a3b-5098c79dab09', true, 'SYSTEM_ADMIN', 'System Administrator', 'Platform configuration and controlled administration.', true);

INSERT INTO "synapse"."permissions" ("description", "permission_id", "permission_code") VALUES ('Approve case access requests', 'ad113531-b4bf-4fb4-ac16-8cc5104a23ea', 'ACCESS_REQUEST_APPROVE');

INSERT INTO "synapse"."permissions" ("description", "permission_id", "permission_code") VALUES ('Export approved analytics', '5d8ecfb2-e08a-4d47-ad80-4cda96271a39', 'ANALYTICS_EXPORT');

INSERT INTO "synapse"."permissions" ("description", "permission_id", "permission_code") VALUES ('View audit events', '8a7c74e3-f7c0-4619-9cec-263f6d2af8a5', 'AUDIT_VIEW');

INSERT INTO "synapse"."permissions" ("description", "permission_id", "permission_code") VALUES ('Create a case', '8724f0cb-541f-460b-8d49-7509dd4c926c', 'CASE_CREATE');

INSERT INTO "synapse"."permissions" ("description", "permission_id", "permission_code") VALUES ('Discover permitted cross-Bureau case metadata', '35b2e5e8-87a0-4fe5-a7a1-b40cc848e0df', 'CASE_DISCOVER_CROSS_BUREAU');

INSERT INTO "synapse"."permissions" ("description", "permission_id", "permission_code") VALUES ('Dispose a case after gate validation', '0a24f48a-4535-4cca-9dd0-ac81701ce64a', 'CASE_DISPOSE');

INSERT INTO "synapse"."permissions" ("description", "permission_id", "permission_code") VALUES ('Propose or confirm case relationships', '8c9c9217-b6c1-4697-b660-704f05e580cb', 'CASE_LINK');

INSERT INTO "synapse"."permissions" ("description", "permission_id", "permission_code") VALUES ('Request or approve reopening according to policy', '8d5d221e-987b-48be-9a04-e5a959b861bf', 'CASE_REOPEN');

INSERT INTO "synapse"."permissions" ("description", "permission_id", "permission_code") VALUES ('Approve a case transfer', '075cf8b9-94a2-4d9e-9479-0a010d80bd97', 'CASE_TRANSFER_APPROVE');

INSERT INTO "synapse"."permissions" ("description", "permission_id", "permission_code") VALUES ('Request a case transfer', '7859dfad-d74c-48cc-b4ae-6aa02d7c7e35', 'CASE_TRANSFER_REQUEST');

INSERT INTO "synapse"."permissions" ("description", "permission_id", "permission_code") VALUES ('View authorized case details', '89bec710-3ebd-4da6-a8de-84b317efaa57', 'CASE_VIEW_DETAILS');

INSERT INTO "synapse"."permissions" ("description", "permission_id", "permission_code") VALUES ('View authorized cases in own Bureau', '6235eb7e-cabc-4ac0-a733-db264c2eab05', 'CASE_VIEW_OWN_BUREAU');

INSERT INTO "synapse"."permissions" ("description", "permission_id", "permission_code") VALUES ('View authorized evidence documents', '294799e5-21d8-4683-bb4a-ff1912ee1a80', 'DOCUMENT_VIEW');

INSERT INTO "synapse"."permissions" ("description", "permission_id", "permission_code") VALUES ('Manage versioned policies', '085e367c-7796-4166-a936-f4eef646ca29', 'POLICY_MANAGE');

INSERT INTO "synapse"."case_statuses" ("sort_order", "is_terminal", "status_code", "display_name") VALUES (1, false, 'DRAFT', 'Draft');

INSERT INTO "synapse"."case_statuses" ("sort_order", "is_terminal", "status_code", "display_name") VALUES (2, false, 'NEW', 'New');

INSERT INTO "synapse"."case_statuses" ("sort_order", "is_terminal", "status_code", "display_name") VALUES (3, false, 'ASSIGNED', 'Assigned');

INSERT INTO "synapse"."case_statuses" ("sort_order", "is_terminal", "status_code", "display_name") VALUES (4, false, 'UNDER_REVIEW', 'Under Review');

INSERT INTO "synapse"."case_statuses" ("sort_order", "is_terminal", "status_code", "display_name") VALUES (5, false, 'AWAITING_INFORMATION', 'Awaiting Information');

INSERT INTO "synapse"."case_statuses" ("sort_order", "is_terminal", "status_code", "display_name") VALUES (6, false, 'ACTION_INITIATED', 'Action Initiated');

INSERT INTO "synapse"."case_statuses" ("sort_order", "is_terminal", "status_code", "display_name") VALUES (7, false, 'ESCALATED', 'Escalated');

INSERT INTO "synapse"."case_statuses" ("sort_order", "is_terminal", "status_code", "display_name") VALUES (8, true, 'DISPOSED', 'Disposed');

INSERT INTO "synapse"."case_statuses" ("sort_order", "is_terminal", "status_code", "display_name") VALUES (9, false, 'REOPENED', 'Reopened');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('1d193671-9222-4526-82d7-e03b85e972c1', '35b2e5e8-87a0-4fe5-a7a1-b40cc848e0df');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('1d193671-9222-4526-82d7-e03b85e972c1', '5d8ecfb2-e08a-4d47-ad80-4cda96271a39');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('1d193671-9222-4526-82d7-e03b85e972c1', '89bec710-3ebd-4da6-a8de-84b317efaa57');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('1d193671-9222-4526-82d7-e03b85e972c1', '8a7c74e3-f7c0-4619-9cec-263f6d2af8a5');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('26ba1600-c999-4ae9-8a3b-5098c79dab09', '075cf8b9-94a2-4d9e-9479-0a010d80bd97');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('26ba1600-c999-4ae9-8a3b-5098c79dab09', '085e367c-7796-4166-a936-f4eef646ca29');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('26ba1600-c999-4ae9-8a3b-5098c79dab09', '0a24f48a-4535-4cca-9dd0-ac81701ce64a');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('26ba1600-c999-4ae9-8a3b-5098c79dab09', '294799e5-21d8-4683-bb4a-ff1912ee1a80');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('26ba1600-c999-4ae9-8a3b-5098c79dab09', '35b2e5e8-87a0-4fe5-a7a1-b40cc848e0df');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('26ba1600-c999-4ae9-8a3b-5098c79dab09', '5d8ecfb2-e08a-4d47-ad80-4cda96271a39');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('26ba1600-c999-4ae9-8a3b-5098c79dab09', '6235eb7e-cabc-4ac0-a733-db264c2eab05');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('26ba1600-c999-4ae9-8a3b-5098c79dab09', '7859dfad-d74c-48cc-b4ae-6aa02d7c7e35');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('26ba1600-c999-4ae9-8a3b-5098c79dab09', '8724f0cb-541f-460b-8d49-7509dd4c926c');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('26ba1600-c999-4ae9-8a3b-5098c79dab09', '89bec710-3ebd-4da6-a8de-84b317efaa57');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('26ba1600-c999-4ae9-8a3b-5098c79dab09', '8a7c74e3-f7c0-4619-9cec-263f6d2af8a5');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('26ba1600-c999-4ae9-8a3b-5098c79dab09', '8c9c9217-b6c1-4697-b660-704f05e580cb');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('26ba1600-c999-4ae9-8a3b-5098c79dab09', '8d5d221e-987b-48be-9a04-e5a959b861bf');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('26ba1600-c999-4ae9-8a3b-5098c79dab09', 'ad113531-b4bf-4fb4-ac16-8cc5104a23ea');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('56d4567d-4ede-4b84-bb52-200ab93c23bd', '0a24f48a-4535-4cca-9dd0-ac81701ce64a');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('56d4567d-4ede-4b84-bb52-200ab93c23bd', '294799e5-21d8-4683-bb4a-ff1912ee1a80');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('56d4567d-4ede-4b84-bb52-200ab93c23bd', '35b2e5e8-87a0-4fe5-a7a1-b40cc848e0df');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('56d4567d-4ede-4b84-bb52-200ab93c23bd', '6235eb7e-cabc-4ac0-a733-db264c2eab05');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('56d4567d-4ede-4b84-bb52-200ab93c23bd', '89bec710-3ebd-4da6-a8de-84b317efaa57');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('742ccf2d-0495-472b-899c-548846afde07', '35b2e5e8-87a0-4fe5-a7a1-b40cc848e0df');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('742ccf2d-0495-472b-899c-548846afde07', '8a7c74e3-f7c0-4619-9cec-263f6d2af8a5');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('b1221b4f-72a0-438d-8f46-c9af188d2451', '294799e5-21d8-4683-bb4a-ff1912ee1a80');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('b1221b4f-72a0-438d-8f46-c9af188d2451', '35b2e5e8-87a0-4fe5-a7a1-b40cc848e0df');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('b1221b4f-72a0-438d-8f46-c9af188d2451', '6235eb7e-cabc-4ac0-a733-db264c2eab05');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('b1221b4f-72a0-438d-8f46-c9af188d2451', '7859dfad-d74c-48cc-b4ae-6aa02d7c7e35');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('b1221b4f-72a0-438d-8f46-c9af188d2451', '8724f0cb-541f-460b-8d49-7509dd4c926c');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('b1221b4f-72a0-438d-8f46-c9af188d2451', '89bec710-3ebd-4da6-a8de-84b317efaa57');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('b1221b4f-72a0-438d-8f46-c9af188d2451', '8c9c9217-b6c1-4697-b660-704f05e580cb');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('b1221b4f-72a0-438d-8f46-c9af188d2451', '8d5d221e-987b-48be-9a04-e5a959b861bf');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('f5baccca-41a2-4124-b35c-15ee61d04b51', '075cf8b9-94a2-4d9e-9479-0a010d80bd97');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('f5baccca-41a2-4124-b35c-15ee61d04b51', '0a24f48a-4535-4cca-9dd0-ac81701ce64a');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('f5baccca-41a2-4124-b35c-15ee61d04b51', '294799e5-21d8-4683-bb4a-ff1912ee1a80');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('f5baccca-41a2-4124-b35c-15ee61d04b51', '35b2e5e8-87a0-4fe5-a7a1-b40cc848e0df');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('f5baccca-41a2-4124-b35c-15ee61d04b51', '6235eb7e-cabc-4ac0-a733-db264c2eab05');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('f5baccca-41a2-4124-b35c-15ee61d04b51', '7859dfad-d74c-48cc-b4ae-6aa02d7c7e35');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('f5baccca-41a2-4124-b35c-15ee61d04b51', '8724f0cb-541f-460b-8d49-7509dd4c926c');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('f5baccca-41a2-4124-b35c-15ee61d04b51', '89bec710-3ebd-4da6-a8de-84b317efaa57');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('f5baccca-41a2-4124-b35c-15ee61d04b51', '8c9c9217-b6c1-4697-b660-704f05e580cb');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('f5baccca-41a2-4124-b35c-15ee61d04b51', '8d5d221e-987b-48be-9a04-e5a959b861bf');

INSERT INTO "synapse"."role_permissions" ("role_id", "permission_id") VALUES ('f5baccca-41a2-4124-b35c-15ee61d04b51', 'ad113531-b4bf-4fb4-ac16-8cc5104a23ea');

INSERT INTO "synapse"."case_relationship_types" ("allow_cycle", "description", "is_directed", "relationship_type") VALUES (true, 'Cases require coordination across owners.', false, 'COORDINATES_WITH');

INSERT INTO "synapse"."case_relationship_types" ("allow_cycle", "description", "is_directed", "relationship_type") VALUES (false, 'Progress or action on the source depends on the target.', true, 'DEPENDS_ON');

INSERT INTO "synapse"."case_relationship_types" ("allow_cycle", "description", "is_directed", "relationship_type") VALUES (false, 'One case is confirmed to duplicate another submission/case.', true, 'DUPLICATE_OF');

INSERT INTO "synapse"."case_relationship_types" ("allow_cycle", "description", "is_directed", "relationship_type") VALUES (true, 'One case formally refers to another matter.', true, 'REFERS_TO');

INSERT INTO "synapse"."case_relationship_types" ("allow_cycle", "description", "is_directed", "relationship_type") VALUES (true, 'Cases concern related matters but remain independently tracked.', false, 'RELATED_TO');

INSERT INTO "synapse"."case_relationship_types" ("allow_cycle", "description", "is_directed", "relationship_type") VALUES (false, 'A newer case or action supersedes an earlier one.', true, 'SUPERSEDES');

COMMIT;

