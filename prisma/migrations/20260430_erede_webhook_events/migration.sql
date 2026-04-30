CREATE TABLE `erede_webhook_events` (
  `id` VARCHAR(191) NOT NULL,
  `external_id` VARCHAR(191) NOT NULL,
  `event_type` ENUM('TOKENIZATION', 'TRANSACTION') NOT NULL,
  `events` JSON NOT NULL,
  `payload` JSON NOT NULL,
  `processed` BOOLEAN NOT NULL DEFAULT false,
  `processed_at` DATETIME(3) NULL,
  `error_message` TEXT NULL,
  `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `erede_webhook_events_external_id_key` (`external_id`),
  INDEX `erede_webhook_events_event_type_processed_idx` (`event_type`, `processed`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
