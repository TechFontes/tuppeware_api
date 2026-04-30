-- Remove índice redundante: a FK payments_saved_card_id_fkey já cria
-- automaticamente um BTREE index em saved_card_id no MySQL/MariaDB.
-- O CREATE INDEX explícito da migration anterior duplicou esse índice.
-- Para dropar o índice, é necessário recriar a FK (MySQL não permite
-- DROP INDEX em coluna usada por FK sem um índice substituto).
ALTER TABLE `payments` DROP FOREIGN KEY `payments_saved_card_id_fkey`;
DROP INDEX `payments_saved_card_id_idx` ON `payments`;
ALTER TABLE `payments`
  ADD CONSTRAINT `payments_saved_card_id_fkey` FOREIGN KEY (`saved_card_id`) REFERENCES `saved_cards`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
