CREATE TABLE "guestbook" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"nickname" varchar(20) NOT NULL,
	"message" varchar(200) NOT NULL,
	"room" varchar(32) NOT NULL,
	"pos_x" real NOT NULL,
	"pos_z" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hidden_at" timestamp with time zone,
	"ip_hash" varchar(64)
);
--> statement-breakpoint
CREATE INDEX "guestbook_room_created_idx" ON "guestbook" ("room","created_at");--> statement-breakpoint
CREATE INDEX "guestbook_ip_created_idx" ON "guestbook" ("ip_hash","created_at");