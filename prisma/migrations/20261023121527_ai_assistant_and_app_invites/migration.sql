-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isBot" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AppInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "note" VARCHAR(280),
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppInviteRedemption" (
    "id" TEXT NOT NULL,
    "inviteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppInviteRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppInvite_token_key" ON "AppInvite"("token");

-- CreateIndex
CREATE INDEX "AppInvite_inviterId_createdAt_idx" ON "AppInvite"("inviterId", "createdAt");

-- CreateIndex
CREATE INDEX "AppInvite_expiresAt_idx" ON "AppInvite"("expiresAt");

-- CreateIndex
CREATE INDEX "AppInviteRedemption_userId_idx" ON "AppInviteRedemption"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AppInviteRedemption_inviteId_userId_key" ON "AppInviteRedemption"("inviteId", "userId");

-- AddForeignKey
ALTER TABLE "AppInvite" ADD CONSTRAINT "AppInvite_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppInviteRedemption" ADD CONSTRAINT "AppInviteRedemption_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "AppInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppInviteRedemption" ADD CONSTRAINT "AppInviteRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
