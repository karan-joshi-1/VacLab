// Shared session store for the application
// In production, this should be replaced with Redis or a database

export interface SessionData {
  ip: string;
  hostname: string;
  expiresAt: number;
}

// In-memory session store
const sessionStore = new Map<string, SessionData>();

export function setSession(token: string, data: SessionData): void {
  sessionStore.set(token, data);
}

export function getSession(token: string): SessionData | undefined {
  return sessionStore.get(token);
}

export function deleteSession(token: string): boolean {
  return sessionStore.delete(token);
}

export function hasSession(token: string): boolean {
  return sessionStore.has(token);
}

// Clean up expired sessions (call this periodically)
export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [token, data] of sessionStore.entries()) {
    if (now > data.expiresAt) {
      sessionStore.delete(token);
      cleaned++;
    }
  }
  
  return cleaned;
}
