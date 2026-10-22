ALTER TABLE `notes` ADD COLUMN `rating` integer CONSTRAINT `notes_rating_check` CHECK (`rating` IS NULL OR (typeof(`rating`) = 'integer' AND `rating` BETWEEN 1 AND 10));
