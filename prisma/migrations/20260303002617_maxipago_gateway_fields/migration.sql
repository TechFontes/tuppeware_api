/*
  Warnings:

  - You are about to drop the column `asaas_id` on the `payments` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[reference_num]` on the table `payments` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[gateway_transaction_id]` on the table `payments` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `payments` DROP COLUMN `asaas_id`,
    ADD COLUMN `callback_payload` JSON NULL,
    ADD COLUMN `gateway_order_id` VARCHAR(191) NULL,
    ADD COLUMN `gateway_provider` ENUM('MAXIPAGO', 'ASAAS') NOT NULL DEFAULT 'MAXIPAGO',
    ADD COLUMN `gateway_status_code` VARCHAR(191) NULL,
    ADD COLUMN `gateway_status_message` VARCHAR(191) NULL,
    ADD COLUMN `gateway_transaction_id` VARCHAR(191) NULL,
    ADD COLUMN `processor_reference` VARCHAR(191) NULL,
    ADD COLUMN `reference_num` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `payments_reference_num_key` ON `payments`(`reference_num`);

-- CreateIndex
CREATE UNIQUE INDEX `payments_gateway_transaction_id_key` ON `payments`(`gateway_transaction_id`);

-- CreateIndex
CREATE INDEX `payments_reference_num_idx` ON `payments`(`reference_num`);

-- CreateIndex
CREATE INDEX `payments_gateway_transaction_id_idx` ON `payments`(`gateway_transaction_id`);
