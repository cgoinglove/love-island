CREATE TABLE "presence" (
	"player_id" varchar(64) PRIMARY KEY,
	"room" varchar(32) NOT NULL,
	"nickname" varchar(20),
	"pos_x" real NOT NULL,
	"pos_z" real NOT NULL,
	"yaw" real NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "presence_room_updated_idx" ON "presence" ("room","updated_at");