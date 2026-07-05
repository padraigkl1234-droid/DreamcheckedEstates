// Multi-tenant model: people belong to a Team (a company). A referral code
// lets someone join a team instantly. The master admin (see admin.ts) sits
// above all teams.

export const DREAMLAND_TEAM_ID = 'dreamland';
export const DREAMLAND_TEAM_NAME = 'Dreamland';

export interface Team {
  id: string;
  name: string;
  referralCode: string;
  createdAt: number;
}

export interface UserProfile {
  uid: string;
  name: string; // from Google, or set on first sign-in
  email?: string | null;
  displayName?: string; // preferred name the user can edit
  teamRole?: string; // their job title within the team
  photoURL?: string | null;
  teamId?: string | null; // which team they belong to
  role?: string; // 'admin' = team-level admin (existing field)
  blocked?: boolean;
  lastSeen?: number;
}

// The name to show for a user — their chosen display name, else Google name.
export function profileName(p: Partial<UserProfile> | null | undefined): string {
  if (!p) return 'Unknown';
  return p.displayName?.trim() || p.name || p.email || 'Unknown';
}

// Referral codes: 6 characters, unambiguous alphabet (no O/0, I/1).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateReferralCode(): string {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}
