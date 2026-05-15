CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"document_id" uuid,
	"title" text DEFAULT 'New Deal Intake',
	"state" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"extracted_text" text,
	"structured_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mandates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"raw_text" text NOT NULL,
	"normalised_text" text,
	"intent" text,
	"sectors" text[],
	"geographies" text[],
	"deal_size_min_cr" numeric,
	"deal_size_max_cr" numeric,
	"revenue_min_cr" numeric,
	"revenue_max_cr" numeric,
	"deal_structure" text,
	"special_conditions" text[],
	"fraud_flags" text[],
	"urgency" text,
	"buyer_type" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"source" text DEFAULT 'WEB' NOT NULL,
	"document_url" text,
	"document_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"action" text NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tokens" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "tokens" CASCADE;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id");--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token");--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_image" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_phone_verified" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_completed_once" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "firm_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "custom_role" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "category" text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "custom_category" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "base_location" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "base_city" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "base_country" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "geographies" text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cross_border" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deal_corridors" text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sectors" text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "intent" text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "expertise_description" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "active_mandates" text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "priority_sectors" text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "open_to_coadvisory" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "collaboration_model" text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_attachment_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "additional_info" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "document_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "document_text" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "otp_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "otp_expires" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "otp_attempts" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "source" text DEFAULT 'web';--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chat_id_chat_sessions_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_transactions" ADD CONSTRAINT "token_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");