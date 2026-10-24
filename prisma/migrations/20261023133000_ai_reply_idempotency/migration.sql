-- One assistant reply per user message. The marker lives on the bot message so
-- `after()` retries and concurrent server processes stay idempotent.
ALTER TABLE "Message" ADD COLUMN "aiSourceMessageId" TEXT;

CREATE UNIQUE INDEX "Message_aiSourceMessageId_key" ON "Message"("aiSourceMessageId");
