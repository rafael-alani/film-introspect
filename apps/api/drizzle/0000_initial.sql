CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);
--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`preferred_jellyfin_user_id` text,
	`preferred_device_id` text,
	`preferred_subtitle_language` text DEFAULT 'eng' NOT NULL,
	`note_lead_seconds` integer DEFAULT 2 NOT NULL,
	`note_trail_seconds` integer DEFAULT 12 NOT NULL,
	`default_note_color` text DEFAULT 'amber' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `media_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`jellyfin_server_key` text DEFAULT '' NOT NULL,
	`jellyfin_item_id` text NOT NULL,
	`media_source_id` text DEFAULT '' NOT NULL,
	`edition_label` text,
	`title` text NOT NULL,
	`context_title` text,
	`kind` text DEFAULT 'video' NOT NULL,
	`year` integer,
	`season_number` integer,
	`episode_number` integer,
	`runtime_seconds` integer,
	`runtime_source` text DEFAULT 'unknown' NOT NULL,
	`jellyfin_runtime_seconds` integer,
	`provider_ids_json` text DEFAULT '{}' NOT NULL,
	`image_tag` text,
	`last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_user_jellyfin_source_uidx` ON `media_items` (`user_id`,`jellyfin_server_key`,`jellyfin_item_id`,`media_source_id`);
--> statement-breakpoint
CREATE INDEX `media_user_last_seen_idx` ON `media_items` (`user_id`,`last_seen_at`);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`media_id` text NOT NULL,
	`at_seconds` integer NOT NULL,
	`body` text NOT NULL,
	`color` text DEFAULT 'amber' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notes_media_time_idx` ON `notes` (`media_id`,`at_seconds`);
--> statement-breakpoint
CREATE INDEX `notes_user_updated_idx` ON `notes` (`user_id`,`updated_at`);
--> statement-breakpoint
CREATE TRIGGER `notes_owner_insert`
BEFORE INSERT ON `notes`
WHEN NOT EXISTS (
	SELECT 1 FROM `media_items`
	WHERE `media_items`.`id` = NEW.`media_id`
	  AND `media_items`.`user_id` = NEW.`user_id`
)
BEGIN
	SELECT RAISE(ABORT, 'note owner does not own media timeline');
END;
--> statement-breakpoint
CREATE TRIGGER `notes_owner_update`
BEFORE UPDATE OF `user_id`, `media_id` ON `notes`
WHEN NOT EXISTS (
	SELECT 1 FROM `media_items`
	WHERE `media_items`.`id` = NEW.`media_id`
	  AND `media_items`.`user_id` = NEW.`user_id`
)
BEGIN
	SELECT RAISE(ABORT, 'note owner does not own media timeline');
END;
