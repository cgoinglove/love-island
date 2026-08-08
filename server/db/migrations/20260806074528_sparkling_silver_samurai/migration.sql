CREATE TABLE "signal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"room" varchar(32) NOT NULL,
	"from_id" varchar(64) NOT NULL,
	"to_id" varchar(64) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"payload" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "signal_to_created_idx" ON "signal" ("to_id","created_at");