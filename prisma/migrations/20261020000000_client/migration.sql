-- CreateTable
CREATE TABLE "ClientSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MeetingRound" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "meetingId" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    CONSTRAINT "MeetingRound_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientSeat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "roundId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "joined" BOOLEAN NOT NULL DEFAULT false,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "speaking" BOOLEAN NOT NULL DEFAULT false,
    "lastHeartbeat" DATETIME,
    CONSTRAINT "ClientSeat_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "MeetingRound" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientVisit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "roundId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL,
    "leftAt" DATETIME,
    CONSTRAINT "ClientVisit_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "MeetingRound" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "Meeting" ADD COLUMN "clientRevision" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "MeetingRound_meetingId_number_key" ON "MeetingRound"("meetingId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ClientSeat_roundId_phone_key" ON "ClientSeat"("roundId", "phone");

-- CreateIndex
CREATE INDEX "ClientVisit_roundId_phone_idx" ON "ClientVisit"("roundId", "phone");

