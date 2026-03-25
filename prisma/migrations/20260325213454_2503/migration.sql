/*
  Warnings:

  - You are about to alter the column `gateway_provider` on the `payments` table. The data in that column could be lost. The data in that column will be cast from `Enum(EnumId(4))` to `Enum(EnumId(4))`.
  - A unique constraint covering the columns `[numero_nf]` on the table `debts` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable (parte 1: adiciona qr_code, converte payment_link para TEXT e adiciona EREDE ao enum)
ALTER TABLE `payments` ADD COLUMN `qr_code` TEXT NULL,
    MODIFY `payment_link` TEXT NULL,
    MODIFY `gateway_provider` ENUM('MAXIPAGO', 'ASAAS', 'EREDE') NOT NULL DEFAULT 'MAXIPAGO';

-- Migra todos os dados existentes para EREDE
UPDATE `payments` SET `gateway_provider` = 'EREDE';

-- AlterTable (parte 2: remove os valores antigos do enum)
ALTER TABLE `payments` MODIFY `gateway_provider` ENUM('EREDE') NOT NULL DEFAULT 'EREDE';

-- AlterTable
ALTER TABLE `users` ADD COLUMN `address` VARCHAR(191) NULL,
    ADD COLUMN `address_complement` VARCHAR(191) NULL,
    ADD COLUMN `address_number` VARCHAR(191) NULL,
    ADD COLUMN `birth_date` DATETIME(3) NULL,
    ADD COLUMN `city` VARCHAR(191) NULL,
    ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `neighbourhood` VARCHAR(191) NULL,
    ADD COLUMN `phone` VARCHAR(191) NULL,
    ADD COLUMN `postal_code` VARCHAR(191) NULL,
    ADD COLUMN `state` VARCHAR(191) NULL,
    MODIFY `role` ENUM('ADMIN', 'GERENTE', 'EMPRESARIA', 'LIDER', 'CONSULTOR') NOT NULL DEFAULT 'CONSULTOR';

-- CreateTable
CREATE TABLE `saved_cards` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `card_brand` VARCHAR(191) NULL,
    `last_four` VARCHAR(191) NOT NULL,
    `holder_name` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `saved_cards_token_key`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `key` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `debts_numero_nf_key` ON `debts`(`numero_nf`);

-- AddForeignKey
ALTER TABLE `saved_cards` ADD CONSTRAINT `saved_cards_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
