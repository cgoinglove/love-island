CREATE TABLE "room_event" (
	"seq" bigserial PRIMARY KEY,
	"event_id" varchar(64) NOT NULL,
	"room" varchar(32) NOT NULL,
	"from_id" varchar(64) NOT NULL,
	"nickname" varchar(20),
	"kind" varchar(16) NOT NULL,
	"text" varchar(80) NOT NULL,
	"pos_x" real NOT NULL,
	"pos_z" real NOT NULL,
	"yaw" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "room_event_room_seq_idx" ON "room_event" ("room","seq");