export type UserStatus = "ACTIVE" | "SUSPENDED" | "EXPIRED";
export type UpstreamType = "XTREAM" | "CUSTOM";
export type UpstreamStatus = "ACTIVE" | "DEGRADED" | "DISABLED";
export type StreamSessionStatus = "ACTIVE" | "CLOSED";

export type Upstream = {
  id: string;
  name: string;
  smartersUrl: string;
  xciptvDns?: string | null;
  type: UpstreamType;
  authMode: string;
  status: UpstreamStatus;
  timeoutMs: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type UpstreamUpdateInput = {
  name?: string;
  smartersUrl?: string;
  xciptvDns?: string | null;
  type?: UpstreamType;
  authMode?: string;
  status?: UpstreamStatus;
  timeoutMs?: number;
};

export type User = {
  id: string;
  fullName: string;
  username: string;
  passwordHash: string;
  password: string;
  status: UserStatus;
  expiresAt: Date;
  maxConnections: number;
  allowedIps: string[];
  metadata: unknown;
  upstreamId: string;
  upstreamUsername: string;
  upstreamPassword: string;
  createdAt: Date;
  updatedAt: Date;
};

export type UserWithUpstream = User & {
  upstream: Upstream;
};

export type UserUpdateInput = {
  fullName?: string;
  username?: string;
  passwordHash?: string;
  password?: string;
  status?: UserStatus;
  expiresAt?: Date;
  maxConnections?: number;
  allowedIps?: string[];
  upstreamId?: string;
  upstreamUsername?: string;
  upstreamPassword?: string;
};
