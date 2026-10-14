-- CreateTable
CREATE TABLE "AgentConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Accounting workspace',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentConversation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confirmedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentMemory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "conversationId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChatMessage_tenantId_conversationId_fkey" FOREIGN KEY ("tenantId", "conversationId") REFERENCES "AgentConversation" ("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ChatMessage" ("content", "createdAt", "id", "role", "userId") SELECT "content", "createdAt", "id", "role", "userId" FROM "ChatMessage";
DROP TABLE "ChatMessage";
ALTER TABLE "new_ChatMessage" RENAME TO "ChatMessage";
CREATE INDEX "ChatMessage_userId_createdAt_idx" ON "ChatMessage"("userId", "createdAt");
CREATE INDEX "ChatMessage_tenantId_conversationId_createdAt_idx" ON "ChatMessage"("tenantId", "conversationId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AgentConversation_tenantId_actorId_updatedAt_idx" ON "AgentConversation"("tenantId", "actorId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentConversation_tenantId_id_key" ON "AgentConversation"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AgentConversation_tenantId_actorId_key" ON "AgentConversation"("tenantId", "actorId");

-- CreateIndex
CREATE INDEX "AgentMemory_tenantId_actorId_category_updatedAt_idx" ON "AgentMemory"("tenantId", "actorId", "category", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentMemory_tenantId_actorId_key_key" ON "AgentMemory"("tenantId", "actorId", "key");
