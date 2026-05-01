CREATE TABLE IF NOT EXISTS "runtime_hosts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"adapter_type" text NOT NULL,
	"catalog_snapshot" jsonb,
	"catalog_fetched_at" timestamp with time zone,
	"reachable" boolean DEFAULT false NOT NULL,
	"last_reachable_at" timestamp with time zone,
	"last_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "runtime_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"host_id" uuid NOT NULL,
	"instance_id" uuid,
	"kind" text NOT NULL,
	"state" text NOT NULL,
	"description" text,
	"result" jsonb,
	"error" jsonb,
	"poll_after_ms" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "runtime_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"host_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"plan" text,
	"desired_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actual_state" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"status_reason" text,
	"last_reconciled_at" timestamp with time zone,
	"last_op_id" uuid,
	"approval_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "runtime_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"instance_id" uuid NOT NULL,
	"bound_entity_kind" text NOT NULL,
	"bound_entity_id" uuid NOT NULL,
	"credentials_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "runtime_secret_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"instance_id" uuid NOT NULL,
	"ref_key" text NOT NULL,
	"secret_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runtime_hosts_company_id_companies_id_fk') THEN
  ALTER TABLE "runtime_hosts" ADD CONSTRAINT "runtime_hosts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runtime_hosts_agent_id_agents_id_fk') THEN
  ALTER TABLE "runtime_hosts" ADD CONSTRAINT "runtime_hosts_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runtime_operations_company_id_companies_id_fk') THEN
  ALTER TABLE "runtime_operations" ADD CONSTRAINT "runtime_operations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runtime_operations_host_id_runtime_hosts_id_fk') THEN
  ALTER TABLE "runtime_operations" ADD CONSTRAINT "runtime_operations_host_id_runtime_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."runtime_hosts"("id") ON DELETE no action ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runtime_instances_company_id_companies_id_fk') THEN
  ALTER TABLE "runtime_instances" ADD CONSTRAINT "runtime_instances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runtime_instances_host_id_runtime_hosts_id_fk') THEN
  ALTER TABLE "runtime_instances" ADD CONSTRAINT "runtime_instances_host_id_runtime_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."runtime_hosts"("id") ON DELETE no action ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runtime_instances_last_op_id_runtime_operations_id_fk') THEN
  ALTER TABLE "runtime_instances" ADD CONSTRAINT "runtime_instances_last_op_id_runtime_operations_id_fk" FOREIGN KEY ("last_op_id") REFERENCES "public"."runtime_operations"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runtime_bindings_company_id_companies_id_fk') THEN
  ALTER TABLE "runtime_bindings" ADD CONSTRAINT "runtime_bindings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runtime_bindings_instance_id_runtime_instances_id_fk') THEN
  ALTER TABLE "runtime_bindings" ADD CONSTRAINT "runtime_bindings_instance_id_runtime_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."runtime_instances"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runtime_secret_refs_company_id_companies_id_fk') THEN
  ALTER TABLE "runtime_secret_refs" ADD CONSTRAINT "runtime_secret_refs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runtime_secret_refs_instance_id_runtime_instances_id_fk') THEN
  ALTER TABLE "runtime_secret_refs" ADD CONSTRAINT "runtime_secret_refs_instance_id_runtime_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."runtime_instances"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "runtime_hosts_company_agent_idx" ON "runtime_hosts" USING btree ("company_id","agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runtime_hosts_company_idx" ON "runtime_hosts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runtime_operations_company_idx" ON "runtime_operations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runtime_operations_host_idx" ON "runtime_operations" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runtime_operations_instance_idx" ON "runtime_operations" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runtime_operations_state_idx" ON "runtime_operations" USING btree ("state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runtime_instances_company_idx" ON "runtime_instances" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runtime_instances_host_idx" ON "runtime_instances" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runtime_instances_host_kind_idx" ON "runtime_instances" USING btree ("host_id","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runtime_bindings_company_idx" ON "runtime_bindings" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runtime_bindings_instance_idx" ON "runtime_bindings" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runtime_bindings_entity_idx" ON "runtime_bindings" USING btree ("bound_entity_kind","bound_entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "runtime_secret_refs_instance_key_idx" ON "runtime_secret_refs" USING btree ("instance_id","ref_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runtime_secret_refs_company_idx" ON "runtime_secret_refs" USING btree ("company_id");
