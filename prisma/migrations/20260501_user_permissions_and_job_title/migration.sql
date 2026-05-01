-- AlterTable: adiciona permissions (JSON) e job_title em users
ALTER TABLE `users`
  ADD COLUMN `permissions` JSON NOT NULL DEFAULT ('[]'),
  ADD COLUMN `job_title` VARCHAR(191) NULL;

-- Backfill: GERENTE recebe set completo (8 permissões)
UPDATE `users`
SET `permissions` = JSON_ARRAY(
  'users.manage',
  'debts.manage',
  'payments.manage',
  'reports.view',
  'reports.export',
  'settings.manage',
  'admins.manage',
  'transactions.approve'
)
WHERE `role` = 'GERENTE';

-- Backfill: ADMIN recebe 7 permissões (tudo exceto admins.manage)
UPDATE `users`
SET `permissions` = JSON_ARRAY(
  'users.manage',
  'debts.manage',
  'payments.manage',
  'reports.view',
  'reports.export',
  'settings.manage',
  'transactions.approve'
)
WHERE `role` = 'ADMIN';

-- Outras roles (EMPRESARIA, LIDER, CONSULTOR) ficam com [] que já é o default
