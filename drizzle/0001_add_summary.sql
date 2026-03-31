ALTER TABLE workspaces ADD COLUMN summary_json TEXT NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE workspaces ADD COLUMN summary_updated_at INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE threads ADD COLUMN summary_json TEXT NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE threads ADD COLUMN summary_updated_at INTEGER NOT NULL DEFAULT 0;
