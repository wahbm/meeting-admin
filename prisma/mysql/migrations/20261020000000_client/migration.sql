-- AlterTable
ALTER TABLE `Meeting` ADD COLUMN `clientRevision` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `ClientSession` (
    `id` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MeetingRound` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `meetingId` INTEGER NOT NULL,
    `number` INTEGER NOT NULL,
    `startedAt` DATETIME(3) NULL,
    `endedAt` DATETIME(3) NULL,

    UNIQUE INDEX `MeetingRound_meetingId_number_key`(`meetingId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientSeat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `roundId` INTEGER NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `joined` BOOLEAN NOT NULL DEFAULT false,
    `muted` BOOLEAN NOT NULL DEFAULT false,
    `speaking` BOOLEAN NOT NULL DEFAULT false,
    `lastHeartbeat` DATETIME(3) NULL,

    UNIQUE INDEX `ClientSeat_roundId_phone_key`(`roundId`, `phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientVisit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `roundId` INTEGER NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `joinedAt` DATETIME(3) NOT NULL,
    `leftAt` DATETIME(3) NULL,

    INDEX `ClientVisit_roundId_phone_idx`(`roundId`, `phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MeetingRound` ADD CONSTRAINT `MeetingRound_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `Meeting`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientSeat` ADD CONSTRAINT `ClientSeat_roundId_fkey` FOREIGN KEY (`roundId`) REFERENCES `MeetingRound`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientVisit` ADD CONSTRAINT `ClientVisit_roundId_fkey` FOREIGN KEY (`roundId`) REFERENCES `MeetingRound`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

