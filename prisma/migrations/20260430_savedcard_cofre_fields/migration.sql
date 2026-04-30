-- AlterTable: adiciona colunas novas em saved_cards
ALTER TABLE `saved_cards`
  ADD COLUMN `tokenization_id` VARCHAR(191) NULL,
  ADD COLUMN `status` ENUM('PENDING', 'ACTIVE', 'INACTIVE', 'FAILED') NOT NULL DEFAULT 'PENDING',
  ADD COLUMN `email` VARCHAR(191) NULL,
  ADD COLUMN `bin` VARCHAR(191) NULL,
  ADD COLUMN `brand_tid` VARCHAR(191) NULL,
  ADD COLUMN `last_synced_at` DATETIME(3) NULL,
  ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

-- Backfill: copia token -> tokenization_id (rename via copy)
UPDATE `saved_cards` SET `tokenization_id` = `token` WHERE `tokenization_id` IS NULL;

-- Backfill: email a partir do user vinculado
UPDATE `saved_cards` sc
  INNER JOIN `users` u ON sc.user_id = u.id
  SET sc.email = u.email
  WHERE sc.email IS NULL;

-- Defesa: se algum cartão não tem user, preenche com placeholder pra não quebrar NOT NULL
UPDATE `saved_cards` SET `email` = 'unknown@placeholder.local' WHERE `email` IS NULL;

-- Aplica NOT NULL e unicidade depois do backfill
ALTER TABLE `saved_cards`
  MODIFY COLUMN `tokenization_id` VARCHAR(191) NOT NULL,
  MODIFY COLUMN `email` VARCHAR(191) NOT NULL,
  ADD UNIQUE INDEX `saved_cards_tokenization_id_key` (`tokenization_id`),
  ADD INDEX `saved_cards_tokenizationId_idx` (`tokenization_id`);

-- DropIndex e DropColumn token (legado)
ALTER TABLE `saved_cards` DROP INDEX `saved_cards_token_key`;
ALTER TABLE `saved_cards` DROP COLUMN `token`;
