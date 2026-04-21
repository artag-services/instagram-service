-- CreateEnum: IgMessageStatus
DO $$ BEGIN
    CREATE TYPE "IgMessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: AIResponseStatus
DO $$ BEGIN
    CREATE TYPE "AIResponseStatus" AS ENUM ('PENDING', 'SENT', 'PARTIAL', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum: ChunkStatus
DO $$ BEGIN
    CREATE TYPE "ChunkStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateUser
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "realName" TEXT,
    "nicknames" TEXT[] NOT NULL,
    "nameTrustScore" Double precision NOT NULL DEFAULT 0.5,
    "nameSource" TEXT,
    "aiEnabled" Boolean NOT NULL DEFAULT true,
    "aiEnabledAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateUserIdentity
CREATE TABLE "UserIdentity" (
    "id" TEXT NOT NULL,
    "channelUserId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "metadata" JSONB,
    "trustScore" Double precision NOT NULL DEFAULT 0.5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateUserContact
CREATE TABLE "UserContact" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "trustScore" Double precision NOT NULL DEFAULT 0.5,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "UserContact_pkey" PRIMARY KEY ("id")
);

-- CreateNameHistory
CREATE TABLE "NameHistory" (
    "id" TEXT NOT NULL,
    "previousName" TEXT,
    "newName" TEXT,
    "reason" TEXT,
    "source" TEXT,
    "trustScore" Double precision NOT NULL DEFAULT 0.5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    CONSTRAINT "NameHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIgMessage
CREATE TABLE "IgMessage" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "status" "IgMessageStatus" NOT NULL DEFAULT 'PENDING',
    "igMessageId" TEXT,
    "errorReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IgMessage_pkey" PRIMARY KEY ("id")
);

-- CreateAIResponse
CREATE TABLE "AIResponse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "originalMessage" TEXT NOT NULL,
    "aiResponse" TEXT NOT NULL,
    "model" TEXT,
    "confidence" Double precision,
    "processingTime" INT,
    "status" "AIResponseStatus" NOT NULL DEFAULT 'PENDING',
    "sentChunks" INT NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AIResponse_pkey" PRIMARY KEY ("id")
);

-- CreateAIResponseChunk
CREATE TABLE "AIResponseChunk" (
    "id" TEXT NOT NULL,
    "aiResponseId" TEXT NOT NULL,
    "chunkNumber" INT NOT NULL,
    "content" TEXT NOT NULL,
    "externalMessageId" TEXT,
    "channel" TEXT,
    "status" "ChunkStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INT NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AIResponseChunk_pkey" PRIMARY KEY ("id")
);

-- CreateN8NRateLimit
CREATE TABLE "N8NRateLimit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "callsToday" INT NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "N8NRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: User.realName
CREATE INDEX "User_realName_idx" ON "User" ("realName");

-- CreateIndex: User.aiEnabled
CREATE INDEX "User_aiEnabled_idx" ON "User" ("aiEnabled");

-- CreateIndex: User.deletedAt
CREATE INDEX "User_deletedAt_idx" ON "User" ("deletedAt");

-- CreateIndex: User.createdAt
CREATE INDEX "User_createdAt_idx" ON "User" ("createdAt");

-- CreateIndex: UserIdentity.channelUserId_channel
CREATE UNIQUE INDEX "UserIdentity_channelUserId_channel_key" ON "UserIdentity" ("channelUserId", "channel");

-- CreateIndex: UserIdentity.userId
CREATE INDEX "UserIdentity_userId_idx" ON "UserIdentity" ("userId");

-- CreateIndex: UserIdentity.channel
CREATE INDEX "UserIdentity_channel_idx" ON "UserIdentity" ("channel");

-- CreateIndex: UserIdentity.trustScore
CREATE INDEX "UserIdentity_trustScore_idx" ON "UserIdentity" ("trustScore");

-- CreateIndex: UserContact.userId_type_value
CREATE UNIQUE INDEX "UserContact_userId_type_value_key" ON "UserContact" ("userId", "type", "value");

-- CreateIndex: UserContact.userId
CREATE INDEX "UserContact_userId_idx" ON "UserContact" ("userId");

-- CreateIndex: UserContact.type_value
CREATE INDEX "UserContact_type_value_idx" ON "UserContact" ("type", "value");

-- CreateIndex: UserContact.trustScore
CREATE INDEX "UserContact_trustScore_idx" ON "UserContact" ("trustScore");

-- CreateIndex: NameHistory.userId
CREATE INDEX "NameHistory_userId_idx" ON "NameHistory" ("userId");

-- CreateIndex: NameHistory.createdAt
CREATE INDEX "NameHistory_createdAt_idx" ON "NameHistory" ("createdAt");

-- CreateIndex: IgMessage.messageId
CREATE UNIQUE INDEX "IgMessage_messageId_key" ON "IgMessage" ("messageId");

-- CreateIndex: AIResponse.userId
CREATE INDEX "AIResponse_userId_idx" ON "AIResponse" ("userId");

-- CreateIndex: AIResponse.status
CREATE INDEX "AIResponse_status_idx" ON "AIResponse" ("status");

-- CreateIndex: AIResponse.senderId
CREATE INDEX "AIResponse_senderId_idx" ON "AIResponse" ("senderId");

-- CreateIndex: AIResponse.createdAt
CREATE INDEX "AIResponse_createdAt_idx" ON "AIResponse" ("createdAt");

-- CreateIndex: AIResponseChunk.aiResponseId
CREATE INDEX "AIResponseChunk_aiResponseId_idx" ON "AIResponseChunk" ("aiResponseId");

-- CreateIndex: AIResponseChunk.status
CREATE INDEX "AIResponseChunk_status_idx" ON "AIResponseChunk" ("status");

-- CreateIndex: N8NRateLimit.userId
CREATE UNIQUE INDEX "N8NRateLimit_userId_key" ON "N8NRateLimit" ("userId");

-- CreateIndex: N8NRateLimit.resetAt
CREATE INDEX "N8NRateLimit_resetAt_idx" ON "N8NRateLimit" ("resetAt");

-- AddForeignKey: UserIdentity.userId
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: UserContact.userId
ALTER TABLE "UserContact" ADD CONSTRAINT "UserContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: NameHistory.userId
ALTER TABLE "NameHistory" ADD CONSTRAINT "NameHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: AIResponseChunk.aiResponseId
ALTER TABLE "AIResponseChunk" ADD CONSTRAINT "AIResponseChunk_aiResponseId_fkey" FOREIGN KEY ("aiResponseId") REFERENCES "AIResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;