// Multi-tenant model: people belong to a Team (a company). A referral code
// lets someone join a team instantly. The master admin (see admin.ts) sits
// above all teams.

export const DREAMLAND_TEAM_ID = 'dreamland';
export const DREAMLAND_TEAM_NAME = 'Dreamland';

// Per-team page visibility. A key that's absent or true means the page is on;
// only an explicit false hides it. The master admin always sees everything.
export type TeamFeatures = Record<string, boolean | undefined>;

// Every page that can be toggled per team, in display order.
export const TOGGLEABLE_PAGES: { key: string; label: string }[] = [
  { key: 'estateRequests', label: 'Estate Requests' },
  { key: 'checklists', label: 'Checklists' },
  { key: 'audits', label: 'Audits' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'showBoard', label: 'Show Board' },
  { key: 'siteMap', label: 'Site Map' },
  { key: 'taskManager', label: 'Task Manager' },
  { key: 'compliance', label: 'Compliance' },
  { key: 'archive', label: 'Archive' },
  { key: 'reports', label: 'Reports' },
];

export function featureEnabled(features: TeamFeatures | undefined, key: string): boolean {
  return features?.[key] !== false;
}

export interface Team {
  id: string;
  name: string;
  referralCode: string;
  createdAt: number;
  features?: TeamFeatures;
  archived?: boolean;
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
  fcmTokens?: string[]; // registered device push tokens (Cloud Messaging)
  notifPrefs?: NotifPrefs; // which push categories this user wants
}

// Which push-notification categories a user opts into. Stored on the user
// profile (not device-local) so the server can respect them when sending.
export interface NotifPrefs {
  urgentCompliance?: boolean;
  taskAssignments?: boolean;
  dailySummary?: boolean;
}

// Default opt-ins for a brand-new profile / when a field is unset.
export const DEFAULT_NOTIF_PREFS: Required<NotifPrefs> = {
  urgentCompliance: true,
  taskAssignments: true,
  dailySummary: false,
};

// Whether a user wants a given category. An unset field uses that category's
// default (task/compliance default on, daily summary default off).
export function notifEnabled(prefs: NotifPrefs | undefined, key: keyof NotifPrefs): boolean {
  return prefs?.[key] ?? DEFAULT_NOTIF_PREFS[key];
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
