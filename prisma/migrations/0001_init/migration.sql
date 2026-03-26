CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED');
CREATE TYPE "UpstreamType" AS ENUM ('XTREAM', 'CUSTOM');
CREATE TYPE "UpstreamStatus" AS ENUM ('ACTIVE', 'DEGRADED', 'DISABLED');
CREATE TYPE "StreamSessionStatus" AS ENUM ('ACTIVE', 'CLOSED');

CREATE TABLE "Upstream" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "smartersUrl" TEXT NOT NULL,
  "xciptvDns" TEXT,
  "type" "UpstreamType" NOT NULL DEFAULT 'XTREAM',
  "authMode" TEXT NOT NULL DEFAULT 'xtream',
  "status" "UpstreamStatus" NOT NULL DEFAULT 'ACTIVE',
  "timeoutMs" INTEGER NOT NULL DEFAULT 8000,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "fullName" TEXT NOT NULL,
  "username" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "maxConnections" INTEGER NOT NULL DEFAULT 1,
  "allowedIps" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metadata" JSONB,
  "upstreamId" TEXT NOT NULL REFERENCES "Upstream"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "upstreamUsername" TEXT NOT NULL,
  "upstreamPassword" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "StreamSession" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "ipAddress" TEXT NOT NULL,
  "userAgent" TEXT,
  "deviceId" TEXT,
  "streamType" TEXT,
  "streamId" TEXT,
  "status" "StreamSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3)
);

CREATE TABLE "AuditLog" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "eventType" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "StreamSession_userId_status_idx" ON "StreamSession"("userId", "status");
CREATE INDEX "AuditLog_userId_eventType_idx" ON "AuditLog"("userId", "eventType");
