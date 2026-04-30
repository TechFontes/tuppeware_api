-- Remove índice redundante: tokenization_id já tem UNIQUE constraint
-- (que implica BTREE index), então este índice extra só adiciona
-- overhead de write sem benefício de leitura.
DROP INDEX `saved_cards_tokenization_id_idx` ON `saved_cards`;
