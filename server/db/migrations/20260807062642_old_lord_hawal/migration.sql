CREATE TABLE "catch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"room" varchar(32) NOT NULL,
	"player_id" varchar(64) NOT NULL,
	"item_id" varchar(32) NOT NULL,
	"code" varchar(12),
	"claimed_at" timestamp with time zone,
	"ip_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "catch_code_idx" ON "catch" ("code");--> statement-breakpoint
CREATE INDEX "catch_ip_created_idx" ON "catch" ("ip_hash","created_at");