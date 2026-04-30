ALTER TABLE `payments`
  ADD COLUMN `brand_tid` VARCHAR(191) NULL,
  ADD COLUMN `card_bin` VARCHAR(191) NULL,
  ADD COLUMN `transaction_link_id` VARCHAR(191) NULL,
  ADD COLUMN `saved_card_id` VARCHAR(191) NULL,
  ADD CONSTRAINT `payments_saved_card_id_fkey` FOREIGN KEY (`saved_card_id`) REFERENCES `saved_cards`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `payments_saved_card_id_idx` ON `payments`(`saved_card_id`);
