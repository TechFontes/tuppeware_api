-- AlterTable
ALTER TABLE `saved_cards` ALTER COLUMN `updated_at` DROP DEFAULT;

-- RenameIndex
ALTER TABLE `saved_cards` RENAME INDEX `saved_cards_tokenizationId_idx` TO `saved_cards_tokenization_id_idx`;
