-- AlterTable
ALTER TABLE `debts` ADD COLUMN `paid_amount` DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `payments` ADD COLUMN `is_partial` BOOLEAN NOT NULL DEFAULT false;
