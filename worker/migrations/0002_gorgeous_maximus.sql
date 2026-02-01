CREATE TABLE `installations` (
	`installation_id` integer PRIMARY KEY NOT NULL,
	`account_login` text NOT NULL,
	`account_type` text NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `pull_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`installation_id` integer NOT NULL,
	`repository` text NOT NULL,
	`pr_number` integer NOT NULL,
	`opened_at` integer NOT NULL,
	`merged_by` text,
	`merged_at` integer,
	`ready_at` integer,
	FOREIGN KEY (`installation_id`) REFERENCES `installations`(`installation_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pr_repo_number` ON `pull_requests` (`repository`,`pr_number`);--> statement-breakpoint
CREATE INDEX `pr_installation` ON `pull_requests` (`installation_id`);--> statement-breakpoint
ALTER TABLE `projects` ADD `installation_id` integer REFERENCES installations(installation_id);--> statement-breakpoint
ALTER TABLE `snapshots` ADD `pull_request_id` text REFERENCES pull_requests(id);