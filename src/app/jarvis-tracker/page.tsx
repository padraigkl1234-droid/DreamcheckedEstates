'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, type User } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { useSound } from '@/components/SoundProvider';
import { BRAND_NAME, BRAND_NAME_DOTTED } from '@/lib/brand';
import { Pinwheel } from '@/components/icons/Pinwheel';
import {
  type ComplianceItem,
  type ComplianceUrgency,
  getOutstandingCompliances,
} from '@/lib/complianceCountdown';
import {
  Power,
  LayoutDashboard,
  ListChecks,
  ShieldCheck,
  Plus,
  Trash2,
  Wifi,
  Radio,
  Newspaper,
  CheckCircle2,
  Circle,
  AlertTriangle,
  X,
  Gauge,
  ImageOff,
  ExternalLink,
  RefreshCw,
  Cloud,
  Droplets,
  Eye,
  Wind,
  Music2,
  Sun,
  CloudSun,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  CloudDrizzle,
  Trophy,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Archive,
  ArchiveRestore,
  TrendingUp,
  FileText,
  Search,
  Download,
  Repeat,
  Upload,
  Check,
  Map as MapIcon,
  MapPin,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Priority = 'High' | 'Medium' | 'Low';
type TaskStatus = 'Not Started' | 'In Progress' | 'Completed';
type PageKey = 'dashboard' | 'calendar' | 'sitemap' | 'tasks' | 'archive' | 'compliance' | 'reports';

interface Task {
  id: string;
  name: string;
  priority: Priority;
  dueDate: string;
  status: TaskStatus;
  archivedAt?: number;
  completedAt?: number;
  category?: string;
  notes?: string;
  area?: string; // Dreamland site-map zone this task is pinned to, if any
}

type RecurrenceFreq = 'weekly' | 'fortnightly' | 'monthly';

interface EventRecurrence {
  freq: RecurrenceFreq;
  until: string; // ISO date, inclusive
}

interface CalendarEvent {
  id: string;
  title: string;
  date: string; // first occurrence
  priority: Priority;
  notes: string;
  recurrence?: EventRecurrence;
  completedDates?: string[]; // occurrence dates (YYYY-MM-DD) ticked off as done
}

function addRecurrenceStep(d: Date, freq: RecurrenceFreq): Date {
  if (freq === 'weekly') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
  if (freq === 'fortnightly') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 14);
  return new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// Expands a (possibly recurring) event into every occurrence date that falls within [rangeStart, rangeEnd].
function getOccurrencesInRange(event: CalendarEvent, rangeStart: string, rangeEnd: string): string[] {
  if (!event.recurrence) {
    return event.date >= rangeStart && event.date <= rangeEnd ? [event.date] : [];
  }
  const occurrences: string[] = [];
  const until = event.recurrence.until && event.recurrence.until < rangeEnd ? event.recurrence.until : rangeEnd;
  const [y, m, d] = event.date.split('-').map(Number);
  let cur = new Date(y, m - 1, d);
  while (toDateInputValue(cur) <= until) {
    const curStr = toDateInputValue(cur);
    if (curStr >= rangeStart && curStr >= event.date) occurrences.push(curStr);
    cur = addRecurrenceStep(cur, event.recurrence.freq);
  }
  return occurrences;
}

interface NewsItem {
  title: string;
  link: string;
  image: string | null;
  pubDate: string | null;
}

interface WeatherData {
  temperatureC: number;
  humidity: number;
  windSpeedKmh: number;
  weatherCode: number;
}

function getWeatherInfo(code: number): { label: string; icon: typeof Cloud } {
  if (code === 0) return { label: 'Clear Sky', icon: Sun };
  if (code === 1 || code === 2) return { label: 'Partly Cloudy', icon: CloudSun };
  if (code === 3) return { label: 'Overcast', icon: Cloud };
  if (code === 45 || code === 48) return { label: 'Fog', icon: CloudFog };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: CloudDrizzle };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: 'Rain', icon: CloudRain };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: 'Snow', icon: CloudSnow };
  if (code >= 95 && code <= 99) return { label: 'Thunderstorm', icon: CloudLightning };
  return { label: 'Overcast', icon: Cloud };
}

type WeatherCategory = 'clear' | 'partly-cloudy' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

function getWeatherCategory(code: number): WeatherCategory {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly-cloudy';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95 && code <= 99) return 'storm';
  return 'cloudy';
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

const SEED_TASKS: Task[] = [
  { id: 't1', name: 'Inspect rooftop HVAC unit 4', priority: 'High', dueDate: '2026-06-20', status: 'In Progress' },
  { id: 't2', name: 'Replace lobby lighting fixtures', priority: 'Medium', dueDate: '2026-06-22', status: 'Not Started' },
  { id: 't3', name: 'Service car park barrier system', priority: 'Low', dueDate: '2026-06-25', status: 'Completed', completedAt: Date.now() - 5 * DAY_MS },
  { id: 't4', name: 'Audit fire extinguisher inventory', priority: 'High', dueDate: '2026-06-19', status: 'Completed', completedAt: Date.now() - 2 * DAY_MS },
];

// One-off tasks dictated ahead of a return from leave — surfaced via a
// quick-add button on Task Manager so they land in the user's saved list
// the next time they're signed in, rather than overwriting it outright.
const PENDING_RETURN_TASKS: Task[] = [
  { id: 'pt1', name: 'Sort the PO for welding', priority: 'Medium', dueDate: '2026-06-23', status: 'Not Started' },
  { id: 'pt2', name: 'Do a meter reading', priority: 'Medium', dueDate: '', status: 'Not Started' },
  { id: 'pt3', name: 'Catch up with Holly', priority: 'Low', dueDate: '', status: 'Not Started' },
  { id: 'pt4', name: 'Double check all contractor requirements since being off', priority: 'High', dueDate: '', status: 'Not Started' },
];

// Inbox triage after annual leave, w/c 22 Jun 2026. Source JSON "Critical" items
// mapped to the app's top existing tier (High) since there is no Critical tier.
// Surfaced via a quick-add button (same mechanism as PENDING_RETURN_TASKS) so
// these land in the user's real saved task list instead of a seed default that
// gets overwritten on sign-in.
const INBOX_TASKS: Task[] = [
  { id: 'it1', name: 'Woodchip — decide order for 25–27 Jun shows', category: 'Events & Ops', priority: 'High', dueDate: '2026-06-22', status: 'Not Started', notes: 'Covered for Fri 19 only. Decide if more needed for 3 shows (Thu 25–Sat 27). Confirm to Hollie.' },
  { id: 'it2', name: 'Trader power — The Streets / Obi’s House', category: 'Events & Ops', priority: 'High', dueDate: '2026-06-26', status: 'Not Started', notes: '4x 16amp must be live by 9am Fri 26 for Twerk N Jerk + Kerb traders (load-in 11am Fri, in situ to end of Obi’s House Sat 27). Confirm with Cary & Craig.' },
  { id: 'it3', name: 'Scenic Railway survey contacts to Jack King', category: 'Compliance & Safety', priority: 'High', dueDate: '2026-06-24', status: 'Not Started', notes: 'Send Jack the survey contractor details so identified repairs can be booked. Grade II* listed.' },
  { id: 'it4', name: 'Walk-in freezer part — reply to Hollie', category: 'Procurement & Quotes', priority: 'High', dueDate: '2026-06-24', status: 'Not Started', notes: 'Perfect Services QU-0733 approved. Confirm freezer size and decide on the ~£4k part.' },
  { id: 'it5', name: 'CleanSmart Solutions — overdue invoice', category: 'Finance', priority: 'High', dueDate: '2026-06-24', status: 'Not Started', notes: 'inv-001866, 83 days overdue and being chased. Get paid / respond.' },
  { id: 'it6', name: 'Quantec — overdue invoice R/30799/5062-01', category: 'Finance', priority: 'High', dueDate: '2026-06-24', status: 'Not Started', notes: 'Second chase from Sharon, no reply yet. Resolve payment.' },
  { id: 'it7', name: 'Confirm RCBO replacement behind Please Sir', category: 'Events & Ops', priority: 'High', dueDate: '2026-06-25', status: 'Not Started', notes: 'Cary booked Richard (electrician) Fri 26 Jun 8am. Confirm Thu 25 he is still attending — needed for Obi’s House Sat 27.' },
  { id: 'it8', name: 'Green room showers — arrange gas safe engineer', category: 'Compliance & Safety', priority: 'High', dueDate: '2026-06-26', status: 'Not Started', notes: 'Drain Doctor can’t fix — thermostat behind wall. Affects green rooms for shows. Book gas safe engineer.' },
  { id: 'it9', name: 'Fan replacement (Nitor) — raise/confirm PO', category: 'Events & Ops', priority: 'High', dueDate: '2026-06-26', status: 'Not Started', notes: 'Only date left is Mon 29 Jun; next month fully booked. Align with Cary and raise/confirm PO to secure before summer holidays.' },
  { id: 'it10', name: 'Kent Water Services — invoice KWS-2764', category: 'Finance', priority: 'High', dueDate: '2026-06-28', status: 'Not Started', notes: '£609.50, due 28 Jun. Approve / pay.' },
  { id: 'it11', name: 'Fire door replacement & remediation quote (HK Safety)', category: 'Compliance & Safety', priority: 'High', dueDate: '2026-06-30', status: 'Not Started', notes: 'Quote from fire door inspections. Statutory — review and progress to works.' },
  { id: 'it12', name: 'Credit card receipts + coding for Julie', category: 'Finance', priority: 'Medium', dueDate: '2026-06-24', status: 'Not Started', notes: 'Provide receipt + coding: B&Q £24.99 (02/06) and Jewson £236.47 (19/05).' },
  { id: 'it13', name: 'Budget tracker — Drain Doctor cost allocation', category: 'Finance', priority: 'Medium', dueDate: '2026-06-24', status: 'Not Started', notes: 'Unread thread. Advise Kelly/Hollie whether drainage cover is a show cost vs estates cost.' },
  { id: 'it14', name: 'DNA Pest Control — receipt the POs', category: 'Finance', priority: 'Medium', dueDate: '2026-06-25', status: 'Not Started', notes: 'Receipt the POs (per Julie) if happy with them.' },
  { id: 'it15', name: 'Check invoices 5616 & 5584', category: 'Finance', priority: 'Medium', dueDate: '2026-06-25', status: 'Not Started', notes: 'Review both; existing £70 PO can be used against 5584 (Julie).' },
  { id: 'it16', name: 'James Richards invoice DL002', category: 'Finance', priority: 'Medium', dueDate: '2026-06-25', status: 'Not Started', notes: 'Electrical cover 30 May. Arrange payment.' },
  { id: 'it17', name: 'Scenic gate insurance claim — send invoices to Sarah', category: 'Procurement & Quotes', priority: 'Medium', dueDate: '2026-06-25', status: 'Not Started', notes: 'Send Sarah Boorman the invoices; she is checking the day rate with Hollie.' },
  { id: 'it18', name: 'Ashford Tarmac PCN — Belgrave Road', category: 'Finance', priority: 'Medium', dueDate: '2026-06-26', status: 'Not Started', notes: 'New PCN for Belgrave Road car park. Dispute as with previous fines.' },
  { id: 'it19', name: 'Vape recycling bins + July recycling contract (Countrystyle)', category: 'Procurement & Quotes', priority: 'Medium', dueDate: '2026-06-26', status: 'Not Started', notes: 'Get actual disposal cost from Harry before buying; confirm budget line; Liz to order ~4 bins. Also confirm status of July recycling contract.' },
  { id: 'it20', name: 'Riello UPS service — review RAMS', category: 'Compliance & Safety', priority: 'Medium', dueDate: '2026-06-30', status: 'Not Started', notes: 'RAMS received for HQ UPS service (SO 222568). Review and confirm schedule.' },
  { id: 'it21', name: 'Quantec open quotes — provide decisions', category: 'Procurement & Quotes', priority: 'Medium', dueDate: '2026-06-30', status: 'Not Started', notes: 'Louisa chasing updates/decisions on all open Dreamland quotes.' },
  { id: 'it22', name: 'Drain Doctor quote 127634 — review', category: 'Procurement & Quotes', priority: 'Medium', dueDate: '2026-06-30', status: 'Not Started', notes: 'Review and decide.' },
  { id: 'it23', name: 'Water contract — review broker offers', category: 'Procurement & Quotes', priority: 'Medium', dueDate: '2026-07-01', status: 'Not Started', notes: 'Review 3 offers (Pozitive, Water Plus, Water2Business) and respond to Laurien (Live Nation).' },
  { id: 'it24', name: 'CWST clean & water sampling (Kent Water)', category: 'Compliance & Safety', priority: 'Medium', dueDate: '2026-07-01', status: 'Not Started', notes: 'Quote to disinfect tree tops cold water tank + monthly fountain sampling. Legionella — review and decide.' },
  { id: 'it25', name: 'RiteHite bi-annual service — confirm', category: 'Compliance & Safety', priority: 'Medium', dueDate: '2026-07-02', status: 'Not Started', notes: 'Provisionally booked 3 Jul. Needs a scissor lift, not a tower — confirm access.' },
  { id: 'it26', name: 'Prins Forklifts — hire agreement + invoices', category: 'Finance', priority: 'Low', dueDate: '2026-06-26', status: 'Not Started', notes: 'Hollie is lead, I’m cc’d. Hire agreement still unsigned + deposit/hire invoices outstanding.' },
  { id: 'it27', name: 'UK Creative Festival EMP V1 — skim', category: 'Events & Ops', priority: 'Low', dueDate: '2026-07-01', status: 'Not Started', notes: 'Review V1 EMP for estates input. Event 2 Jul.' },
  { id: 'it28', name: 'Glass balustrades (decking) — support Cary', category: 'Procurement & Quotes', priority: 'Low', dueDate: '2026-07-01', status: 'Not Started', notes: 'SW Ltd to attend and find a solution; tarmac/concrete around decking makes lifting difficult. Heavy gig calendar.' },
];

// Outlook inbox triage, w/c 22 Jun 2026 (post-leave catch-up). Genuinely new actionable
// items found by scanning recent emails — excludes anything that's just an update/confirmation
// on an already-tracked item (e.g. Nitor fan booking, Prins Forklifts PO, Dreamland Collections,
// invoice 5584). Surfaced via the same quick-add mechanism as INBOX_TASKS.
const OUTLOOK_TASKS: Task[] = [
  { id: 'ot1', name: 'Approve Inspyrus invoice 1578105513 — Live Nation (Music) UK Ltd', category: 'Finance', priority: 'High', dueDate: '2026-06-26', status: 'Not Started', notes: 'Julie: now part of Operations, needs to go on the tracker. Approve via Inspyrus.' },
  { id: 'ot2', name: 'Approve Inspyrus invoice INV-11541 — VR Sani-Co Ltd', category: 'Finance', priority: 'Medium', dueDate: '2026-06-26', status: 'Not Started', notes: 'Awaiting your approval in Inspyrus.' },
  { id: 'ot3', name: 'Approve Inspyrus invoice 49490 — Total Supplies Ltd', category: 'Finance', priority: 'Medium', dueDate: '2026-06-26', status: 'Not Started', notes: 'Awaiting your approval in Inspyrus.' },
  { id: 'ot4', name: 'Invoice S58509 — confirm for tracker', category: 'Finance', priority: 'Medium', dueDate: '2026-06-26', status: 'Not Started', notes: 'Julie flagged this needs to go on the tracker if not already there — check with Hollie or Kelly; will be processed via Inspyrus.' },
  { id: 'ot5', name: 'Overheating external network cabinets — arrange fix', category: 'Compliance & Safety', priority: 'High', dueDate: '2026-06-26', status: 'Not Started', notes: "David Rigley (Live Nation IT) reports cabinet temps over 55°C against a 45°C hardware max — risk to CCTV, park screens & lighting. Perfect Services' extractor fans aren't enough. Arrange a meeting to agree a solution before peak summer heat." },
  { id: 'ot6', name: 'Review Arlington Car Park Audit findings (street sweeper)', category: 'Compliance & Safety', priority: 'Medium', dueDate: '2026-07-01', status: 'Not Started', notes: 'Craig Ellis sent audit findings + suggestions for Arlington Car Park, incl. a pushable street sweeper option. Review PDF and respond with decisions.' },
  { id: 'ot7', name: 'Confirm on-site contact for KERB Sunday power setup', category: 'Events & Ops', priority: 'Medium', dueDate: '2026-06-27', status: 'Not Started', notes: "Kelsey (KERB) asked who their electrician should liaise with on-site this Sunday morning." },
  { id: 'ot8', name: 'Complete Action Counters Terrorism 2026-2027 course', category: 'Compliance & Safety', priority: 'High', dueDate: '2026-07-15', status: 'Not Started', notes: 'Mandatory Workday Learning Hub course — complete within 21 days of 24 Jun.' },
  { id: 'ot9', name: 'Canterbury Lifts — arrange callout for lift issue', category: 'Procurement & Quotes', priority: 'Medium', dueDate: '2026-07-01', status: 'Not Started', notes: "Engineer believes the current fault is unrelated to the Feb works; they've offered to arrange a callout to investigate." },
  { id: 'ot10', name: "Decide on Stark's MHHS offer — reply to Laurien", category: 'Finance', priority: 'Medium', dueDate: '2026-06-30', status: 'Not Started', notes: "Laurien (Live Nation) needs a final yes/no on Stark's Market-wide Half-Hourly Settlement reform offer." },
  { id: 'ot11', name: 'DHT container access — confirm for 30 Jun ~9am', category: 'Events & Ops', priority: 'Low', dueDate: '2026-06-29', status: 'Not Started', notes: 'Tamara (Dreamland Heritage Trust) asked for container access early morning 30 Jun so they can sort items inside.' },
  { id: 'ot12', name: 'Order Screwfix parts for Cary', category: 'Procurement & Quotes', priority: 'Medium', dueDate: '2026-06-26', status: 'Not Started', notes: 'McAlpine basin waste x3, Flomasta 15mm pipe, M9x20 socket countersunk screws.' },
];

const SEED_EVENTS: CalendarEvent[] = [
  { id: 'e1', title: 'Ansul Meeting', date: '2026-06-20', priority: 'High', notes: 'It is with Paul A.' },
];

// One-click import of the user's external Jun-Dec 2026 calendar, transcribed from screenshots.
// Recurring entries use the recurrence feature; titles/dates flagged "verify" were partially
// cut off or hard to read in the source screenshots and should be double-checked.
const IMPORT_SCHEDULE: CalendarEvent[] = [
  { id: 'imp-r1', title: 'Estates & Maintenance Team', date: '2026-06-02', priority: 'Medium', notes: 'Weekly team check-in.', recurrence: { freq: 'weekly', until: '2026-12-29' } },
  { id: 'imp-r2', title: 'Virtual Global Meditation', date: '2026-06-09', priority: 'Low', notes: '', recurrence: { freq: 'weekly', until: '2026-09-29' } },
  { id: 'imp-r3', title: 'Site Safety Walk', date: '2026-06-10', priority: 'Medium', notes: 'Rotates between Cinque Ports, Poppenhame, 4DXB A and KERB A — verify which site each week.', recurrence: { freq: 'weekly', until: '2026-12-30' } },
  { id: 'imp-r4', title: 'Live and Commercial Events', date: '2026-06-10', priority: 'Low', notes: '', recurrence: { freq: 'weekly', until: '2026-09-30' } },
  { id: 'imp-r5', title: 'Live and Commercial Events', date: '2026-06-11', priority: 'Low', notes: '', recurrence: { freq: 'weekly', until: '2026-09-30' } },
  { id: 'imp-r6', title: 'H&S Fire Safety Committee', date: '2026-07-02', priority: 'High', notes: '', recurrence: { freq: 'monthly', until: '2026-12-31' } },
  { id: 'imp-r7', title: 'PKL 1-2-1', date: '2026-07-02', priority: 'Medium', notes: '', recurrence: { freq: 'monthly', until: '2026-12-31' } },
  { id: 'imp-r8', title: 'Meter Readings & Fire Doors', date: '2026-06-26', priority: 'Medium', notes: '', recurrence: { freq: 'monthly', until: '2026-12-31' } },
  { id: 'imp-r9', title: 'Water Meter Reading', date: '2026-06-01', priority: 'Low', notes: 'High-frequency reading task — add extra ad hoc dates manually if it occurs more than twice a week.', recurrence: { freq: 'weekly', until: '2026-12-28' } },
  { id: 'imp-r10', title: 'Water Meter Reading', date: '2026-06-04', priority: 'Low', notes: '', recurrence: { freq: 'weekly', until: '2026-12-31' } },
  { id: 'imp-o1', title: 'Event Operations Meeting', date: '2026-06-03', priority: 'Medium', notes: '' },
  { id: 'imp-o2', title: '1st Interview', date: '2026-06-05', priority: 'Medium', notes: 'Transcribed from "Collo Day - 1st Interview" — verify exact title.' },
  { id: 'imp-o3', title: 'Fire Dampers Service', date: '2026-06-12', priority: 'Medium', notes: '' },
  { id: 'imp-o4', title: 'Operational Fire and Safety', date: '2026-06-16', priority: 'Medium', notes: '' },
  { id: 'imp-o5', title: 'Live Nation Global Employee Event', date: '2026-06-17', priority: 'Low', notes: 'Best-effort read from screenshot — verify exact title.' },
  { id: 'imp-o6', title: 'REPLAY: Live Nation Global Employee Event', date: '2026-06-18', priority: 'Low', notes: 'Best-effort read from screenshot — verify exact title.' },
  { id: 'imp-o7', title: 'Triangle', date: '2026-06-23', priority: 'Medium', notes: 'Site name only in source screenshot — verify what this refers to.' },
  { id: 'imp-o8', title: 'Arlington Car Park Safety', date: '2026-06-24', priority: 'Medium', notes: '' },
  { id: 'imp-o9', title: 'Profile UPS Service Visit', date: '2026-07-07', priority: 'Medium', notes: '' },
  { id: 'imp-o10', title: 'Cinema Maintenance Check', date: '2026-07-08', priority: 'Medium', notes: '' },
  { id: 'imp-o11', title: 'FRA Review - 50 Marine Terrace', date: '2026-07-09', priority: 'Medium', notes: 'Site name truncated in source — verify exact address.' },
  { id: 'imp-o12', title: '2027 Estates Budget Review', date: '2026-08-03', priority: 'High', notes: '' },
  { id: 'imp-o13', title: 'Operational Fire and Safety', date: '2026-08-19', priority: 'Medium', notes: '' },
  { id: 'imp-o14', title: 'FRA Review - Cinema', date: '2026-10-13', priority: 'Medium', notes: '' },
  { id: 'imp-o15', title: 'Cinema Maintenance Check', date: '2026-11-10', priority: 'Medium', notes: '' },
];

// New calendar invites found in Outlook since 22 Jun 2026 that aren't already covered by
// SEED_EVENTS/IMPORT_SCHEDULE (most other invites in that window — meditation, water meter
// reading, site safety walks, 1-2-1s etc. — are recurring entries already imported above).
const OUTLOOK_EVENTS: CalendarEvent[] = [
  { id: 'oe1', title: 'Insurance visit - Affilifest', date: '2026-06-25', priority: 'Medium', notes: 'Organised by Sarah Boorman, w/ James Penfold, Craig Ellis, Hollie Taylor. Tentative, 09:30-10:30.' },
  { id: 'oe2', title: 'Fire Dampers Testing', date: '2026-06-29', priority: 'Medium', notes: 'All-day, with Cary Phipps.' },
  { id: 'oe3', title: 'Meter Readings', date: '2026-06-29', priority: 'Low', notes: '08:00-09:30.' },
  { id: 'oe4', title: 'Visit for the Glass Balustrade', date: '2026-07-01', priority: 'Medium', notes: '10:00-11:00, with Cary Phipps — relates to the glass balustrades (decking) task.' },
];

const SEED_COMPLIANCES: ComplianceItem[] = [
  { id: 'c1', name: 'AC System', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c2', name: 'Ansul fire suppression', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c3', name: 'Asbestos survey', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c4', name: 'Boiler Service', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c5', name: 'Carpentry Machinery Servicing', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c6', name: 'CCTV Maintenance', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c7', name: 'Emergency Lighting Testing', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c8', name: 'Fire Alarm & PAVA', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c9', name: 'Fire Door Inspections', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c10', name: 'Fire extinguishers', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c11', name: 'Fire Shutters', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c12', name: 'Fixed wiring inspection', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c13', name: 'Generator Servicing', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c14', name: 'Kitchen Extract Cleaning', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c15', name: 'Legionella Risk Assessment', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c16', name: 'Lighting Protection', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c17', name: 'LOLER inspections (Cinema roof platform & lifting equipment)', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c18', name: 'Passenger lift & barrel lift Cinque Ports service & LOLER', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c19', name: 'PAT Testing', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c20', name: 'People Counter', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c21', name: 'Pest Control', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c22', name: 'Scaffold Inspections', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c23', name: 'Water Hygiene Testing', completed: false, date: '', nextDueDate: '', comments: '' },
  { id: 'c24', name: 'Workshop machine LEV', completed: false, date: '', nextDueDate: '', comments: '' },
];

// Compliance divisions, shown in this order in the tracker. Items are sorted into
// a division by keyword on their name, so seeded, Firestore-loaded and custom
// items all group consistently without needing a stored field.
const COMPLIANCE_DIVISION_ORDER = [
  'Fire Safety',
  'Electrical',
  'Mechanical & Plant',
  'Lifting & Access',
  'Water Hygiene',
  'Security & Monitoring',
  'Site & Hazards',
  'General',
] as const;

function classifyComplianceDivision(name: string): string {
  const n = name.toLowerCase();
  if (/fire|ansul|pava|extinguisher|sprinkler|suppression|emergency light/.test(n)) return 'Fire Safety';
  if (/loler|lift|scaffold|hoist|mewp|working at height/.test(n)) return 'Lifting & Access';
  if (/legionella|water hygiene|water sampl|cwst|tank clean/.test(n)) return 'Water Hygiene';
  if (/wiring|pat testing|\bpat\b|generator|lightning|lighting protection|electric|rcbo/.test(n)) return 'Electrical';
  if (/ac system|air con|boiler|hvac|extract|\blev\b|machinery|carpentry|plant|gas safe/.test(n)) return 'Mechanical & Plant';
  if (/cctv|people counter|security|surveillance/.test(n)) return 'Security & Monitoring';
  if (/asbestos|pest/.test(n)) return 'Site & Hazards';
  return 'General';
}

// Per-card stagger timing for the dashboard's reveal animation.
const CARD_REVEAL_STEP_MS = 90;
const CARD_REVEAL_DURATION_MS = 420;

const NAV_ITEMS: { key: PageKey; label: string; icon: typeof LayoutDashboard; gapBefore?: boolean }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'sitemap', label: 'Site Map', icon: MapIcon },
  { key: 'tasks', label: 'Task Manager', icon: ListChecks },
  { key: 'compliance', label: 'Compliance', icon: ShieldCheck },
  { key: 'archive', label: 'Archive', icon: Archive, gapBefore: true },
  { key: 'reports', label: 'Reports', icon: FileText },
];

const PRIORITY_STYLES: Record<Priority, string> = {
  High: 'text-alert border-alert/40 bg-alert/10 shadow-glow-subtle',
  Medium: 'text-amber-300 border-amber-400/30 bg-amber-400/10 shadow-glow-subtle',
  Low: 'text-neutral-300 border-neutral-400/30 bg-neutral-400/10 shadow-glow-subtle',
};

const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

const CATEGORY_TAG_STYLE = 'text-neutral-400 border-neutral-500/40 bg-neutral-500/10';

const STATUS_STYLES: Record<TaskStatus, string> = {
  'Not Started': 'text-neutral-400 border-neutral-500/40 bg-neutral-500/10',
  'In Progress': 'text-amber-300 border-amber-400/40 bg-amber-400/10',
  Completed: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10',
};

// Order in which task status groups are shown in the Active Tasks list.
const STATUS_ORDER: TaskStatus[] = ['Not Started', 'In Progress', 'Completed'];

const URGENCY_STYLES: Record<ComplianceUrgency, string> = {
  red: 'text-alert border-alert/50 bg-alert/10 motion-safe:animate-pulse-alert shadow-glow-alert',
  amber: 'text-amber-300 border-amber-400/40 bg-amber-400/10',
  green: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10',
};

function formatDueIn(daysUntilDue: number): string {
  if (daysUntilDue < 0) {
    const overdue = Math.abs(daysUntilDue);
    return `Overdue ${overdue}d`;
  }
  if (daysUntilDue === 0) return 'Due today';
  if (daysUntilDue === 1) return 'Due tomorrow';
  return `Due in ${daysUntilDue}d`;
}

// Whole-day difference between two YYYY-MM-DD strings, ignoring time of day.
function daysFromToday(dateStr: string, todayStr: string): number {
  const [y1, m1, d1] = dateStr.split('-').map(Number);
  const [y2, m2, d2] = todayStr.split('-').map(Number);
  return Math.round((new Date(y1, m1 - 1, d1).getTime() - new Date(y2, m2 - 1, d2).getTime()) / DAY_MS);
}

interface TimelinePoint {
  label: string;
  iso: string;
  tasks: number;
  compliance: number;
}

const TIMELINE_DAYS = 14;

// Buckets completions into a rolling N-day window for the dashboard chart.
// Tasks use their completedAt timestamp (active and archived alike, since
// archiving only hides a task from the active list — it doesn't undo the
// completion); compliance items reuse the existing "Last Completed" date
// field already entered in the tracker.
function buildCompletionTimeline(tasks: Task[], archivedTasks: Task[], compliances: ComplianceItem[]): TimelinePoint[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days: TimelinePoint[] = Array.from({ length: TIMELINE_DAYS }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (TIMELINE_DAYS - 1 - i));
    return {
      label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      iso: toDateInputValue(d),
      tasks: 0,
      compliance: 0,
    };
  });

  const indexByIso = new Map(days.map((p, idx) => [p.iso, idx]));

  for (const task of [...tasks, ...archivedTasks]) {
    if (task.status !== 'Completed' || !task.completedAt) continue;
    const idx = indexByIso.get(toDateInputValue(new Date(task.completedAt)));
    if (idx !== undefined) days[idx].tasks += 1;
  }

  for (const item of compliances) {
    if (!item.completed || !item.date) continue;
    const idx = indexByIso.get(item.date);
    if (idx !== undefined) days[idx].compliance += 1;
  }

  return days;
}

interface ReportEntry {
  id: string;
  kind: 'task' | 'compliance';
  name: string;
  completedAt: number;
  hasTimeOfDay: boolean;
  priority?: Priority;
  dueDate?: string;
  nextDueDate?: string;
  comments?: string;
}

// A chronological completion log — one entry per completed task (active or
// archived) and per compliance item marked complete. Compliance items only
// carry a date (no time-of-day), so those entries are flagged accordingly
// rather than implying a precision the source data doesn't have.
function buildReportLog(tasks: Task[], archivedTasks: Task[], compliances: ComplianceItem[]): ReportEntry[] {
  const entries: ReportEntry[] = [];

  for (const task of [...tasks, ...archivedTasks]) {
    if (task.status !== 'Completed' || !task.completedAt) continue;
    entries.push({
      id: `task-${task.id}`,
      kind: 'task',
      name: task.name,
      completedAt: task.completedAt,
      hasTimeOfDay: true,
      priority: task.priority,
      dueDate: task.dueDate,
    });
  }

  for (const item of compliances) {
    if (!item.completed || !item.date) continue;
    const parsed = new Date(`${item.date}T00:00:00`).getTime();
    if (Number.isNaN(parsed)) continue;
    entries.push({
      id: `compliance-${item.id}`,
      kind: 'compliance',
      name: item.name,
      completedAt: parsed,
      hasTimeOfDay: false,
      nextDueDate: item.nextDueDate,
      comments: item.comments,
    });
  }

  return entries.sort((a, b) => b.completedAt - a.completedAt);
}

function genId() {
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toDateInputValue(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatRelativeTime(pubDate: string | null): string {
  if (!pubDate) return '';
  const then = new Date(pubDate).getTime();
  if (Number.isNaN(then)) return '';
  const diffMins = Math.round((Date.now() - then) / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

// ---------------------------------------------------------------------------
// HUD bracket corners (Iron Man style panel frame accents)
// ---------------------------------------------------------------------------

function HudCorners({ tone = 'crimson' }: { tone?: 'crimson' | 'amber' }) {
  const c = tone === 'amber' ? 'border-amber-400/70' : 'border-invictus-crimson-bright/70';
  return (
    <>
      <span className={`pointer-events-none absolute -top-px -left-px h-3 w-3 border-l-2 border-t-2 ${c}`} />
      <span className={`pointer-events-none absolute -top-px -right-px h-3 w-3 border-r-2 border-t-2 ${c}`} />
      <span className={`pointer-events-none absolute -bottom-px -left-px h-3 w-3 border-l-2 border-b-2 ${c}`} />
      <span className={`pointer-events-none absolute -bottom-px -right-px h-3 w-3 border-r-2 border-b-2 ${c}`} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Telemetry scaffolding — crosshairs, micro corner brackets, serial tags
// ---------------------------------------------------------------------------

function Crosshair({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={`h-2 w-2 shrink-0 ${className}`} fill="none">
      <line x1="5" y1="0" x2="5" y2="3.2" stroke="currentColor" strokeWidth="1" />
      <line x1="5" y1="6.8" x2="5" y2="10" stroke="currentColor" strokeWidth="1" />
      <line x1="0" y1="5" x2="3.2" y2="5" stroke="currentColor" strokeWidth="1" />
      <line x1="6.8" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" />
      <circle cx="5" cy="5" r="0.6" fill="currentColor" />
    </svg>
  );
}

function SysRef({ code, className = '' }: { code: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap font-mono text-[10px] tracking-widest text-neutral-500/70 ${className}`}>
      <Crosshair className="text-invictus-crimson-bright/50" />
      SYS_REF: {code}
    </span>
  );
}

function Kicker({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-neutral-500 ${className}`}>
      <Crosshair className="text-invictus-crimson-bright/40" />
      {children}
    </span>
  );
}

function MicroCorners() {
  return (
    <>
      <span className="pointer-events-none absolute -top-px -left-px h-1.5 w-1.5 border-l border-t border-invictus-crimson-bright/35" />
      <span className="pointer-events-none absolute -top-px -right-px h-1.5 w-1.5 border-r border-t border-invictus-crimson-bright/35" />
      <span className="pointer-events-none absolute -bottom-px -left-px h-1.5 w-1.5 border-l border-b border-invictus-crimson-bright/35" />
      <span className="pointer-events-none absolute -bottom-px -right-px h-1.5 w-1.5 border-r border-b border-invictus-crimson-bright/35" />
    </>
  );
}

function ConcentricPulse() {
  return (
    <>
      <span
        className="pointer-events-none absolute inset-0 rounded-full border border-invictus-crimson-bright/40 animate-ping"
        style={{ animationDuration: '2.6s' }}
      />
      <span
        className="pointer-events-none absolute inset-0 rounded-full border border-invictus-crimson-bright/25 animate-ping"
        style={{ animationDuration: '2.6s', animationDelay: '0.9s' }}
      />
      <span
        className="pointer-events-none absolute inset-0 rounded-full border border-invictus-crimson-bright/15 animate-ping"
        style={{ animationDuration: '2.6s', animationDelay: '1.8s' }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Boot dial — layered sci-fi HUD reactor ring, rotating clockwise
// ---------------------------------------------------------------------------

// All geometry below is centered on a 200x200 viewBox. Angles are degrees
// clockwise from 12 o'clock so the "letter port" placements below read the
// same way a clock face does.
function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// Closed cog outline: alternates outer/inner radius around the circle to
// produce square-toothed gear teeth, matching the blocky HUD aesthetic.
function gearPath(cx: number, cy: number, teeth: number, outerR: number, innerR: number, toothRatio = 0.5) {
  const step = 360 / teeth;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const a1 = a0 + step * toothRatio;
    const a2 = a0 + step;
    const p0 = polarPoint(cx, cy, outerR, a0);
    const p1 = polarPoint(cx, cy, outerR, a1);
    const p2 = polarPoint(cx, cy, innerR, a1);
    const p3 = polarPoint(cx, cy, innerR, a2);
    d += `${i === 0 ? 'M' : 'L'} ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} `;
    d += `L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)} `;
  }
  return `${d}Z`;
}

// A ring of short radial tick marks; every `longEvery`-th tick is drawn taller
// to read as an instrument bezel rather than a perfectly uniform dial.
function TickRing({ cx, cy, count, rInner, rOuter, longEvery = 5, longExtra = 5, color, opacity = 0.8 }: {
  cx: number;
  cy: number;
  count: number;
  rInner: number;
  rOuter: number;
  longEvery?: number;
  longExtra?: number;
  color: string;
  opacity?: number;
}) {
  const ticks = Array.from({ length: count });
  return (
    <g>
      {ticks.map((_, i) => {
        const angle = (360 / count) * i;
        const isLong = i % longEvery === 0;
        const p0 = polarPoint(cx, cy, rInner - (isLong ? longExtra : 0), angle);
        const p1 = polarPoint(cx, cy, rOuter, angle);
        return (
          <line
            key={i}
            x1={p0.x}
            y1={p0.y}
            x2={p1.x}
            y2={p1.y}
            stroke={color}
            strokeWidth={isLong ? 1.6 : 0.8}
            strokeOpacity={opacity}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

// Fixed (non-rotating) outer frame: lettered ports + small rect glyphs, so
// labels stay upright while the dials beneath them spin.
function HudFrame({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const glyphAngles = [25, 95, 170, 245, 320];

  return (
    <g>
      {glyphAngles.map((angle) => {
        const p = polarPoint(cx, cy, r - 9, angle);
        return (
          <rect
            key={angle}
            x={p.x - 3}
            y={p.y - 1.5}
            width={6}
            height={3}
            fill="rgba(194,48,74,0.5)"
            transform={`rotate(${angle} ${p.x} ${p.y})`}
          />
        );
      })}
    </g>
  );
}

function BootDial({
  onIgnite,
  mode = 'idle',
}: {
  onIgnite: () => void;
  mode?: 'idle' | 'spinup' | 'expand';
}) {
  const cx = 100;
  const cy = 100;
  const spinningUp = mode !== 'idle';

  return (
    <div
      className={`relative h-[240px] w-[240px] shrink-0 transition-all duration-1000 ease-in sm:h-[300px] sm:w-[300px] lg:h-[360px] lg:w-[360px] ${
        mode === 'expand' ? 'scale-[2.4] opacity-0' : 'scale-100 opacity-100'
      }`}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{ filter: 'drop-shadow(0 0 22px rgba(194,48,74,0.45))' }}
      >
        {/* Outer static bezel ring + glyph ports — fixed, does not rotate */}
        <svg viewBox="0 0 200 200" className="absolute h-full w-full">
          <circle cx={cx} cy={cy} r={96} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
          <HudFrame cx={cx} cy={cy} r={96} />
        </svg>

        {/* Sparse outer tick ring, slow clockwise drift — spins up on ignite */}
        <svg
          viewBox="0 0 200 200"
          className={`absolute h-full w-full ${spinningUp ? 'animate-[spin_1.8s_linear_infinite]' : 'animate-[spin_40s_linear_infinite]'}`}
        >
          <TickRing cx={cx} cy={cy} count={48} rInner={88} rOuter={92} color="rgba(194,48,74,0.7)" />
        </svg>

        {/* Segmented arc ring (the original highlight sweep), mid speed — spins up on ignite */}
        <svg
          viewBox="0 0 200 200"
          className={`absolute h-full w-full ${spinningUp ? 'animate-[spin_0.6s_linear_infinite]' : 'animate-[spin_5s_linear_infinite]'}`}
        >
          <circle
            cx={cx}
            cy={cy}
            r={82}
            fill="none"
            stroke="rgba(194,48,74,0.9)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="50 18 22 26 14 380"
            style={{ filter: 'drop-shadow(0 0 8px rgba(194,48,74,0.9))' }}
          />
        </svg>

        {/* Dense barcode-style tick ring, clockwise — spins up on ignite */}
        <svg
          viewBox="0 0 200 200"
          className={`absolute h-full w-full ${spinningUp ? 'animate-[spin_1.1s_linear_infinite]' : 'animate-[spin_22s_linear_infinite]'}`}
        >
          <TickRing cx={cx} cy={cy} count={80} rInner={68} rOuter={74} longEvery={4} longExtra={2} color="rgba(244,160,170,0.55)" opacity={0.7} />
        </svg>

        {/* Outer cog ring, slow mechanical clockwise turn — spins up on ignite */}
        <svg
          viewBox="0 0 200 200"
          className={`absolute h-full w-full ${spinningUp ? 'animate-[spin_1.4s_linear_infinite]' : 'animate-[spin_30s_linear_infinite]'}`}
        >
          <path
            d={gearPath(cx, cy, 28, 60, 53, 0.55)}
            fill="rgba(154,34,54,0.28)"
            stroke="rgba(194,48,74,0.85)"
            strokeWidth={1}
          />
        </svg>

        {/* Inner cog ring, nested, faster clockwise turn — spins up on ignite */}
        <svg
          viewBox="0 0 200 200"
          className={`absolute h-full w-full ${spinningUp ? 'animate-[spin_0.8s_linear_infinite]' : 'animate-[spin_16s_linear_infinite]'}`}
        >
          <path
            d={gearPath(cx, cy, 20, 44, 38, 0.55)}
            fill="rgba(154,34,54,0.32)"
            stroke="rgba(194,48,74,0.9)"
            strokeWidth={1}
          />
        </svg>

        {/* Innermost fine tick ring hugging the power button, fastest clockwise turn — spins up on ignite */}
        <svg
          viewBox="0 0 200 200"
          className={`absolute h-full w-full ${spinningUp ? 'animate-[spin_0.4s_linear_infinite]' : 'animate-[spin_8s_linear_infinite]'}`}
        >
          <TickRing cx={cx} cy={cy} count={36} rInner={28} rOuter={32} longEvery={3} longExtra={1.5} color="rgba(194,48,74,0.8)" />
        </svg>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onIgnite();
        }}
        disabled={spinningUp}
        className="group absolute inset-[36%] flex items-center justify-center rounded-full border border-invictus-crimson-bright/50 bg-invictus-crimson-bright/5 shadow-glow-subtle transition-all duration-300 hover:scale-105 hover:shadow-glow-strong"
      >
        <span className="absolute inset-0 rounded-full border border-invictus-crimson-bright/30 animate-pulse" />
        <Power className="relative z-10 h-7 w-7 text-invictus-crimson-bright drop-shadow-glow-subtle transition-all group-hover:text-white group-hover:drop-shadow-glow-strong" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Boot HUD side panels — network/quick-links and environment/systems
// ---------------------------------------------------------------------------

function HudCornerPanel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative border border-neutral-400/20 bg-invictus-base/60 p-4 shadow-glow-subtle backdrop-blur-md ${className}`}>
      <MicroCorners />
      {children}
    </div>
  );
}

function SignalBars({ level }: { level: number }) {
  const bars = Array.from({ length: 5 });
  return (
    <div className="flex items-end gap-0.5">
      {bars.map((_, i) => (
        <span
          key={i}
          className={`w-1 rounded-sm ${i < level ? 'bg-neutral-300 shadow-glow-subtle' : 'bg-neutral-800'}`}
          style={{ height: `${6 + i * 3}px` }}
        />
      ))}
    </div>
  );
}

function MiniMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-neutral-500">
        <span>{label}</span>
        <span className="font-mono tabular-nums text-neutral-300">{value}%</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-800/70">
        <div
          className="h-full rounded-full bg-gradient-to-r from-invictus-crimson to-invictus-crimson-bright shadow-glow-subtle"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

const BOOT_QUICK_LINKS: { label: string; icon: typeof ListChecks; value: number }[] = [
  { label: 'Task Queue', icon: ListChecks, value: 64 },
  { label: 'Compliance DB', icon: ShieldCheck, value: 100 },
  { label: 'News Uplink', icon: Newspaper, value: 88 },
  { label: `${BRAND_NAME} Core`, icon: Pinwheel, value: 100 },
];

function NetworkPanel() {
  return (
    <HudCornerPanel className="w-52">
      <div className="mb-4 flex items-center justify-between">
        <Kicker>Estate Link</Kicker>
        <SignalBars level={5} />
      </div>
      <div className="mb-1 flex items-center gap-2">
        <Wifi className="h-4 w-4 text-neutral-300" />
        <span className="font-mono text-base font-bold tabular-nums text-neutral-200 [text-shadow:var(--glow-text-subtle)]">98%</span>
      </div>
      <p className="mb-4 text-[10px] tracking-widest text-neutral-600">ESTATE-WIFI · LAN SECURE</p>

      <div className="space-y-3 border-t border-neutral-400/15 pt-3">
        {BOOT_QUICK_LINKS.map((link) => (
          <div key={link.label} className="flex items-center gap-2">
            <link.icon className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
            <MiniMeter label={link.label} value={link.value} />
          </div>
        ))}
      </div>
    </HudCornerPanel>
  );
}

function Waveform() {
  const bars = Array.from({ length: 14 });
  return (
    <div className="flex h-6 items-end gap-[3px]">
      {bars.map((_, i) => (
        <span
          key={i}
          className="w-[3px] rounded-sm bg-neutral-300/80 shadow-glow-subtle"
          style={{
            animation: `waveform ${0.8 + (i % 4) * 0.15}s ease-in-out infinite`,
            animationDelay: `${i * 0.05}s`,
          }}
        />
      ))}
    </div>
  );
}

function EnvironmentPanel() {
  return (
    <HudCornerPanel className="w-56">
      <Kicker className="mb-3">Site Environment</Kicker>
      <div className="mb-1 flex items-center gap-2">
        <Cloud className="h-5 w-5 text-neutral-300" />
        <span className="font-mono text-xl font-bold tabular-nums text-neutral-200 [text-shadow:var(--glow-text-subtle)]">18°C</span>
      </div>
      <p className="mb-3 text-[10px] tracking-widest text-neutral-600">OVERCAST · ESTATE GROUNDS</p>

      <div className="mb-4 grid grid-cols-3 gap-2 border-t border-neutral-400/15 pt-3 text-center">
        <div>
          <Droplets className="mx-auto mb-1 h-3.5 w-3.5 text-neutral-500" />
          <p className="font-mono text-xs text-neutral-200">64%</p>
          <p className="text-[10px] uppercase tracking-widest text-neutral-600">Humid</p>
        </div>
        <div>
          <Eye className="mx-auto mb-1 h-3.5 w-3.5 text-neutral-500" />
          <p className="font-mono text-xs text-neutral-200">9km</p>
          <p className="text-[10px] uppercase tracking-widest text-neutral-600">Visib</p>
        </div>
        <div>
          <Wind className="mx-auto mb-1 h-3.5 w-3.5 text-neutral-500" />
          <p className="font-mono text-xs text-neutral-200">14kt</p>
          <p className="text-[10px] uppercase tracking-widest text-neutral-600">Wind</p>
        </div>
      </div>

      <div className="border-t border-neutral-400/15 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-500">
            <Music2 className="h-3 w-3" /> Ambient Feed
          </span>
          <span className="text-[10px] uppercase tracking-widest text-emerald-400 [text-shadow:0_0_8px_rgba(52,211,153,0.8)]">Live</span>
        </div>
        <Waveform />
      </div>
    </HudCornerPanel>
  );
}

// ---------------------------------------------------------------------------
// Circular progress chart — radial HUD dial with tick ring + radar sweep
// ---------------------------------------------------------------------------

function CircularProgress({ percentage }: { percentage: number }) {
  const radius = 76;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative flex h-56 w-56 items-center justify-center">
      <svg viewBox="0 0 200 200" className="absolute h-full w-full -rotate-90">
        <defs>
          <linearGradient id="invictusProgressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#C2304A" />
            <stop offset="100%" stopColor="#9A2236" />
          </linearGradient>
        </defs>

        {/* base ring */}
        <circle cx="100" cy="100" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />

        {/* progress ring */}
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="url(#invictusProgressGradient)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 0.7s ease',
            filter: 'drop-shadow(0 0 3px rgba(194,48,74,0.3))',
          }}
        />

        {/* rotating radar sweep arc */}
        <circle
          cx="100"
          cy="100"
          r={radius - 18}
          fill="none"
          stroke="rgba(194,48,74,0.55)"
          strokeWidth="1.5"
          strokeDasharray="16 220"
          strokeLinecap="round"
          className="animate-[spin_4s_linear_infinite]"
          style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
        />

        {/* inner dashed bezel, counter-rotating */}
        <circle
          cx="100"
          cy="100"
          r={radius - 30}
          fill="none"
          stroke="rgba(194,48,74,0.25)"
          strokeWidth="1"
          strokeDasharray="2 5"
          className="animate-[spin_9s_linear_infinite_reverse]"
          style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-4xl font-normal tabular-nums tracking-tight text-neutral-100 [text-shadow:var(--glow-text-subtle)]">
          {percentage}%
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar({
  activePage,
  onNavigate,
  user,
  syncStatus,
}: {
  activePage: PageKey;
  onNavigate: (p: PageKey) => void;
  user: User | null;
  syncStatus: 'idle' | 'loading' | 'synced' | 'error';
}) {
  const { playHover } = useSound();
  return (
    <aside className="flex w-16 flex-col border-r border-neutral-400/20 bg-invictus-base/70 shadow-glow-subtle backdrop-blur-xl md:w-60">
      <div className="flex h-16 items-center justify-center gap-2 border-b border-neutral-400/20 px-2 md:justify-start md:px-5">
        <Pinwheel className="h-7 w-7 text-invictus-crimson-bright drop-shadow-glow-subtle" />
        <div className="hidden md:block">
          <p className="font-display text-sm font-normal tracking-[0.15em] text-invictus-crimson-bright [text-shadow:var(--glow-text-subtle)]">{BRAND_NAME_DOTTED}</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1 p-2 md:p-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.key;
          return (
            <React.Fragment key={item.key}>
              {item.gapBefore && <div className="mx-1 my-2 border-t border-neutral-400/15" />}
              <button
                onClick={() => onNavigate(item.key)}
                onMouseEnter={playHover}
                className={`flex items-center justify-center gap-3 rounded-md border px-3 py-2.5 text-xs uppercase tracking-wider transition-all md:justify-start ${
                  active
                    ? 'border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 text-neutral-100 shadow-glow-strong'
                    : 'border-transparent text-neutral-500 hover:border-invictus-crimson-bright/20 hover:bg-invictus-crimson-bright/5 hover:text-invictus-crimson-bright'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden md:inline">{item.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-neutral-400/20 p-3">
        <div className="flex items-center justify-center gap-2 md:justify-start">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="hidden text-[10px] uppercase tracking-widest text-emerald-400 md:inline">
            Online
          </span>
        </div>
        <div className="mt-2 flex items-center justify-center gap-2 md:justify-start">
          <Cloud
            className={`h-3.5 w-3.5 ${
              !user
                ? 'text-neutral-700'
                : syncStatus === 'error'
                ? 'text-alert'
                : syncStatus === 'loading'
                ? 'animate-pulse text-invictus-crimson-bright'
                : 'text-emerald-400'
            }`}
          />
          <span
            className={`hidden text-[10px] uppercase tracking-widest md:inline ${
              !user
                ? 'text-neutral-700'
                : syncStatus === 'error'
                ? 'text-alert'
                : syncStatus === 'loading'
                ? 'text-invictus-crimson-bright'
                : 'text-emerald-400'
            }`}
          >
            {!user
              ? 'Sign in to save'
              : syncStatus === 'error'
              ? 'Sync error'
              : syncStatus === 'loading'
              ? 'Syncing...'
              : 'Progress saved'}
          </span>
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// INVICTUS greeting line — time-of-day aware, names the single most urgent
// compliance item using the shared Compliance Countdown data/RAG logic.
// ---------------------------------------------------------------------------

function getFirstName(user: User | null): string {
  if (user?.displayName) return user.displayName.trim().split(/\s+/)[0];
  if (user?.email) {
    const local = user.email.split('@')[0];
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return 'sir';
}

function getGreetingPrefix(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Burning the midnight oil';
}

function buildGreeting(user: User | null, compliances: ComplianceItem[], now: Date): string {
  const name = getFirstName(user);
  const prefix = getGreetingPrefix(now.getHours());
  const outstanding = getOutstandingCompliances(compliances, now);

  if (outstanding.length === 0) {
    return `${prefix}, ${name}. All systems nominal, nothing outstanding.`;
  }

  const top = outstanding[0];
  const dueClause = formatDueIn(top.daysUntilDue).toLowerCase();

  if (outstanding.length === 1) {
    return `${prefix}, ${name}. One item needs attention — ${top.item.name}, ${dueClause}.`;
  }

  return `${prefix}, ${name}. ${outstanding.length} items need attention — most urgent is ${top.item.name}, ${dueClause}.`;
}

function InvictusGreeting({ compliances }: { compliances: ComplianceItem[] }) {
  const { user } = useAuth();
  const [greeting] = useState(() => buildGreeting(user, compliances, new Date()));

  return (
    <div className="relative mb-6 flex items-center gap-3 rounded-md border border-invictus-crimson-bright/25 bg-invictus-crimson-bright/5 px-4 py-3 shadow-glow-subtle">
      <MicroCorners />
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-invictus-crimson-bright/50 bg-invictus-crimson-bright/10">
        <Pinwheel className="h-4 w-4 text-invictus-crimson-bright" />
        <ConcentricPulse />
      </div>
      <p className="text-sm text-neutral-100 [text-shadow:var(--glow-text-subtle)]">{greeting}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reveal — staggered fade/translate-in wrapper for the post-boot dashboard
// assembly. Renders children as-is (no wrapper, no animation) when `animate`
// is false, so it's a no-op once a session has already booted.
// ---------------------------------------------------------------------------

function Reveal({ index, animate, children }: { index: number; animate: boolean; children: React.ReactNode }) {
  if (!animate) return <>{children}</>;
  return (
    <div className="animate-card-in" style={{ animationDelay: `${index * CARD_REVEAL_STEP_MS}ms` }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard({
  tasks,
  archivedTasks,
  compliances,
  events,
  animateCardsIn = false,
  onCardsRevealed,
  onToggleMeeting,
}: {
  tasks: Task[];
  archivedTasks: Task[];
  compliances: ComplianceItem[];
  events: CalendarEvent[];
  animateCardsIn?: boolean;
  onCardsRevealed?: () => void;
  onToggleMeeting: (id: string, date: string) => void;
}) {
  const [news, setNews] = useState<{ general: NewsItem[]; football: NewsItem[] }>({
    general: [],
    football: [],
  });
  const [newsStatus, setNewsStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherStatus, setWeatherStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    const loadNews = async () => {
      try {
        const res = await fetch('/api/jarvis-news');
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || data.error) {
          setNewsStatus('error');
          return;
        }
        setNews({ general: data.general ?? [], football: data.football ?? [] });
        setNewsStatus('ready');
      } catch {
        if (!cancelled) setNewsStatus('error');
      }
    };
    loadNews();
    const newsId = setInterval(loadNews, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(newsId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadWeather = async () => {
      try {
        const res = await fetch('/api/jarvis-weather');
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || data.error) {
          setWeatherStatus('error');
          return;
        }
        setWeather(data);
        setWeatherStatus('ready');
      } catch {
        if (!cancelled) setWeatherStatus('error');
      }
    };
    loadWeather();
    const weatherId = setInterval(loadWeather, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(weatherId);
    };
  }, []);

  // Tell the parent once the staggered reveal has finished so re-mounting
  // this component later in the same session (switching tabs and back) won't replay it.
  useEffect(() => {
    if (!animateCardsIn) return;
    const cardCount = 11; // greeting + 10 panels
    const totalMs = (cardCount - 1) * CARD_REVEAL_STEP_MS + CARD_REVEAL_DURATION_MS;
    const timeout = setTimeout(() => onCardsRevealed?.(), totalMs);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateCardsIn]);

  // Overall task completion — tasks only (active list + archived), not compliances.
  const overallTasks = [...tasks, ...archivedTasks];
  const completedItems = overallTasks.filter((t) => t.status === 'Completed').length;
  const totalItems = overallTasks.length;
  const completionPct = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);

  const recentTasks = [...tasks].slice(-4).reverse();

  const upcomingCompliances = getOutstandingCompliances(compliances).slice(0, 4);

  const timeline = useMemo(
    () => buildCompletionTimeline(tasks, archivedTasks, compliances),
    [tasks, archivedTasks, compliances]
  );
  const timelineTaskTotal = timeline.reduce((sum, p) => sum + p.tasks, 0);
  const timelineComplianceTotal = timeline.reduce((sum, p) => sum + p.compliance, 0);

  const todayStr = useMemo(() => toDateInputValue(new Date()), []);
  const todaysMeetings = events
    .filter((ev) => getOccurrencesInRange(ev, todayStr, todayStr).length > 0)
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  return (
    <div className="space-y-6">
      <Reveal index={0} animate={animateCardsIn}>
        <InvictusGreeting compliances={compliances} />
      </Reveal>

      <Reveal index={1} animate={animateCardsIn}>
        <Panel title="Today's Meetings" icon={CalendarDays} refCode="0035-M" tier="primary">
          <div className="flex flex-col gap-2">
            {todaysMeetings.length === 0 && (
              <p className="py-6 text-center text-xs text-neutral-600">No meetings scheduled today.</p>
            )}
            {todaysMeetings.map((ev) => {
              const done = ev.completedDates?.includes(todayStr) ?? false;
              return (
              <div
                key={ev.id}
                className={`relative flex items-start gap-3 rounded-md border shadow-glow-subtle px-3 py-2.5 ${
                  done ? 'border-emerald-400/30 bg-emerald-400/5' : 'border-neutral-400/20 bg-invictus-base/40'
                }`}
              >
                <MicroCorners />
                <button
                  onClick={() => onToggleMeeting(ev.id, todayStr)}
                  className={`mt-0.5 shrink-0 transition-colors ${
                    done ? 'text-emerald-300' : 'text-neutral-500 hover:text-invictus-crimson-bright'
                  }`}
                  title={done ? 'Mark as not done' : 'Mark as done'}
                  aria-pressed={done}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`flex items-center gap-1.5 text-sm ${done ? 'text-neutral-500 line-through' : 'text-neutral-100'}`}>
                    {ev.recurrence && <Repeat className="h-3 w-3 shrink-0 text-neutral-400" />}
                    <span className="truncate">{ev.title}</span>
                  </p>
                  {ev.notes && <Kicker>{ev.notes}</Kicker>}
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLES[ev.priority]}`}>
                  {ev.priority}
                </span>
              </div>
              );
            })}
          </div>
        </Panel>
      </Reveal>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Reveal index={2} animate={animateCardsIn}>
        <Panel title="Overall Tasks Completed" icon={Gauge} refCode="0012-A" tier="primary">
          <div className="flex flex-1 items-center justify-center py-2">
            <CircularProgress percentage={completionPct} />
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-neutral-400/15 pt-4 text-center">
            <div>
              <p className="font-mono text-xl font-bold tabular-nums text-emerald-300">{completedItems}</p>
              <Kicker className="justify-center">Completed</Kicker>
            </div>
            <div>
              <p className="font-mono text-xl font-bold tabular-nums text-neutral-200">{totalItems - completedItems}</p>
              <Kicker className="justify-center">Outstanding</Kicker>
            </div>
          </div>
        </Panel>
        </Reveal>

        <Reveal index={3} animate={animateCardsIn}>
        <Panel title="Recently Added Tasks" icon={ListChecks} refCode="0027-T" tier="primary">
          <div className="flex flex-col gap-2">
            {recentTasks.length === 0 && (
              <p className="py-6 text-center text-xs text-neutral-600">No tasks logged yet.</p>
            )}
            {recentTasks.map((task) => (
              <div
                key={task.id}
                className="relative flex items-center justify-between gap-2 rounded-md border border-neutral-400/20 bg-invictus-base/40 shadow-glow-subtle px-3 py-2.5"
              >
                <MicroCorners />
                <div className="min-w-0">
                  <p className="truncate text-sm text-neutral-100">{task.name}</p>
                  <Kicker>Due {task.dueDate || '—'}</Kicker>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[task.status]}`}>
                  {task.status}
                </span>
              </div>
            ))}
          </div>
        </Panel>
        </Reveal>

        <Reveal index={4} animate={animateCardsIn}>
        <Panel title="Compliance Countdown" icon={ShieldCheck} refCode="0030-C" tier="primary">
          <div className="flex flex-col gap-2">
            {upcomingCompliances.length === 0 && (
              <p className="py-6 text-center text-xs text-neutral-600">No outstanding compliance items.</p>
            )}
            {upcomingCompliances.map(({ item, daysUntilDue, urgency }) => (
              <div
                key={item.id}
                className="relative flex items-center justify-between gap-2 rounded-md border border-neutral-400/20 bg-invictus-base/40 shadow-glow-subtle px-3 py-2.5"
              >
                <MicroCorners />
                <div className="min-w-0">
                  <p className="truncate text-sm text-neutral-100">{item.name}</p>
                  <Kicker>Due {item.nextDueDate || '—'}</Kicker>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${URGENCY_STYLES[urgency]}`}>
                  {formatDueIn(daysUntilDue)}
                </span>
              </div>
            ))}
          </div>
        </Panel>
        </Reveal>
      </div>

      <Reveal index={5} animate={animateCardsIn}>
        <CompletionTimelinePanel
          timeline={timeline}
          taskTotal={timelineTaskTotal}
          complianceTotal={timelineComplianceTotal}
        />
      </Reveal>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Reveal index={6} animate={animateCardsIn}>
          <WeatherPanel weather={weather} status={weatherStatus} tier="ambient" />
        </Reveal>
        <Reveal index={7} animate={animateCardsIn}>
          <NewsPanel
            title="BBC News Feed"
            icon={Newspaper}
            refCode="0091-N"
            items={news.general}
            status={newsStatus}
            tier="ambient"
          />
        </Reveal>
        <Reveal index={8} animate={animateCardsIn}>
          <NewsPanel
            title="Football News"
            icon={Trophy}
            refCode="0093-F"
            items={news.football}
            status={newsStatus}
            tier="ambient"
          />
        </Reveal>
      </div>
    </div>
  );
}

function CompletionTimelineTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; dataKey: string }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const tasks = payload.find((p) => p.dataKey === 'tasks')?.value ?? 0;
  const compliance = payload.find((p) => p.dataKey === 'compliance')?.value ?? 0;
  return (
    <div className="rounded-md border border-neutral-400/30 bg-invictus-base/95 px-3 py-2 shadow-glow-subtle backdrop-blur-xl">
      <p className="mb-1 text-[10px] uppercase tracking-widest text-neutral-500">{label}</p>
      <p className="flex items-center gap-2 text-xs text-neutral-100">
        <span className="h-2 w-2 rounded-full bg-invictus-crimson-bright" /> Tasks: {tasks}
      </p>
      <p className="flex items-center gap-2 text-xs text-neutral-100">
        <span className="h-2 w-2 rounded-full bg-emerald-400" /> Compliance: {compliance}
      </p>
    </div>
  );
}

function CompletionTimelinePanel({
  timeline,
  taskTotal,
  complianceTotal,
}: {
  timeline: TimelinePoint[];
  taskTotal: number;
  complianceTotal: number;
}) {
  return (
    <Panel title="Completion Timeline" icon={TrendingUp} refCode="0040-X" tier="primary">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Kicker>Last {TIMELINE_DAYS} days</Kicker>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-xs text-neutral-300">
            <span className="h-2 w-2 rounded-full bg-invictus-crimson-bright shadow-glow-subtle" />
            <span className="font-mono font-bold tabular-nums">{taskTotal}</span> Tasks
          </span>
          <span className="flex items-center gap-1.5 text-xs text-neutral-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-glow-subtle" />
            <span className="font-mono font-bold tabular-nums">{complianceTotal}</span> Compliance
          </span>
        </div>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={timeline} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="timelineTasksGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#C2304A" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#C2304A" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="timelineComplianceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34D399" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#34D399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'rgba(163,163,163,0.7)', fontSize: 10 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              tickLine={false}
              interval={Math.ceil(TIMELINE_DAYS / 7) - 1}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: 'rgba(163,163,163,0.7)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={24}
            />
            <Tooltip content={<CompletionTimelineTooltip />} cursor={{ stroke: 'rgba(194,48,74,0.3)' }} />
            <Area
              type="monotone"
              dataKey="tasks"
              stroke="#C2304A"
              strokeWidth={2}
              fill="url(#timelineTasksGradient)"
              activeDot={{ r: 4, fill: '#C2304A' }}
            />
            <Area
              type="monotone"
              dataKey="compliance"
              stroke="#34D399"
              strokeWidth={2}
              fill="url(#timelineComplianceGradient)"
              activeDot={{ r: 4, fill: '#34D399' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

function WeatherPanel({
  weather,
  status,
  tier = 'primary',
}: {
  weather: WeatherData | null;
  status: 'loading' | 'ready' | 'error';
  tier?: 'primary' | 'ambient';
}) {
  const info = weather ? getWeatherInfo(weather.weatherCode) : null;
  const WeatherIcon = info?.icon ?? Cloud;

  // Live local clock, shown alongside the weather. The dashboard only renders
  // client-side (behind the mounted gate), so this never mismatches on hydration.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Panel title="Margate · Time & Weather" icon={WeatherIcon} refCode="0061-W" tier={tier}>
      <div className="mb-4 border-b border-neutral-400/15 pb-4 text-center">
        <p className="font-mono text-2xl font-bold tabular-nums tracking-widest text-neutral-200 [text-shadow:var(--glow-text-subtle)]">
          {now.toLocaleTimeString('en-GB')}
        </p>
        <p className="text-[10px] uppercase tracking-widest text-neutral-600">
          {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>
      {status === 'loading' && (
        <div className="flex flex-col items-center gap-2 py-10 text-neutral-600">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <p className="text-xs uppercase tracking-widest">Acquiring feed...</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-2 py-10 text-amber-400">
          <AlertTriangle className="h-5 w-5" />
          <p className="text-center text-xs uppercase tracking-widest">Weather uplink unavailable</p>
        </div>
      )}

      {status === 'ready' && weather && info && (
        <div className="flex h-full flex-col gap-4">
          <div className="text-center">
            <div className="mb-1 flex items-center justify-center gap-2">
              <WeatherIcon className="h-6 w-6 text-neutral-300" />
              <span className="font-mono text-2xl font-bold tabular-nums text-neutral-200 [text-shadow:var(--glow-text-subtle)]">
                {weather.temperatureC}°C
              </span>
            </div>
            <p className="text-[10px] uppercase tracking-widest text-neutral-600">{info.label} · Margate, UK</p>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-neutral-400/15 pt-4 text-center">
            <div>
              <Droplets className="mx-auto mb-1 h-3.5 w-3.5 text-neutral-500" />
              <p className="font-mono text-xs text-neutral-200">{weather.humidity}%</p>
              <p className="text-[10px] uppercase tracking-widest text-neutral-600">Humidity</p>
            </div>
            <div>
              <Wind className="mx-auto mb-1 h-3.5 w-3.5 text-neutral-500" />
              <p className="font-mono text-xs text-neutral-200">{weather.windSpeedKmh}km/h</p>
              <p className="text-[10px] uppercase tracking-widest text-neutral-600">Wind</p>
            </div>
          </div>

          <WeatherScene category={getWeatherCategory(weather.weatherCode)} />
        </div>
      )}
    </Panel>
  );
}

function WeatherScene({ category }: { category: WeatherCategory }) {
  return (
    <div className="relative min-h-[90px] flex-1 overflow-hidden rounded-md border border-neutral-400/15 bg-invictus-base/40">
      {category === 'clear' && <SunScene />}
      {category === 'partly-cloudy' && <CloudScene withSun />}
      {category === 'cloudy' && <CloudScene />}
      {category === 'fog' && <FogScene />}
      {category === 'rain' && <RainScene />}
      {category === 'snow' && <SnowScene />}
      {category === 'storm' && <StormScene />}
    </div>
  );
}

function SunScene() {
  const sparkles = Array.from({ length: 6 });
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div className="absolute h-16 w-16 rounded-full bg-amber-300/20 blur-xl animate-pulse" />
      <Sun className="relative h-12 w-12 text-amber-300 drop-shadow-[0_0_5px_rgba(251,191,36,0.3)] animate-[spin_18s_linear_infinite]" />
      {sparkles.map((_, i) => (
        <span
          key={i}
          className="absolute bottom-3 h-1 w-1 rounded-full bg-amber-200/80 animate-float-sparkle"
          style={{
            left: `${14 + i * 14}%`,
            animationDuration: `${2.6 + i * 0.4}s`,
            animationDelay: `${i * 0.45}s`,
          }}
        />
      ))}
    </div>
  );
}

function CloudScene({ withSun = false }: { withSun?: boolean }) {
  return (
    <div className="relative h-full w-full">
      {withSun && (
        <Sun className="absolute left-[30%] top-[22%] h-9 w-9 text-amber-300/80 drop-shadow-[0_0_4px_rgba(251,191,36,0.25)] animate-[spin_22s_linear_infinite]" />
      )}
      <Cloud
        className="absolute top-1/2 h-12 w-12 -translate-y-1/2 text-neutral-300 drop-shadow-[0_0_4px_rgba(255,255,255,0.18)] animate-cloud-drift"
        style={{ left: '22%' }}
      />
      <Cloud
        className="absolute top-[62%] h-7 w-7 text-neutral-400/50 animate-cloud-drift"
        style={{ left: '54%', animationDuration: '13s', animationDirection: 'reverse' }}
      />
    </div>
  );
}

function FogScene() {
  const bands = Array.from({ length: 3 });
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-2.5">
      <CloudFog className="mb-1 h-9 w-9 text-neutral-300/80 drop-shadow-[0_0_4px_rgba(255,255,255,0.15)]" />
      {bands.map((_, i) => (
        <span
          key={i}
          className="h-1 w-[70%] rounded-full bg-neutral-400/30 animate-fog-drift"
          style={{ animationDuration: `${8 + i * 2}s`, animationDelay: `${i * 0.6}s` }}
        />
      ))}
    </div>
  );
}

function RainScene() {
  const drops = Array.from({ length: 10 });
  return (
    <div className="relative h-full w-full">
      <CloudRain className="absolute left-1/2 top-[18%] h-11 w-11 -translate-x-1/2 text-neutral-300 drop-shadow-[0_0_4px_rgba(255,255,255,0.18)]" />
      {drops.map((_, i) => (
        <span
          key={i}
          className="absolute top-[52%] w-[2px] h-2.5 rounded-full bg-neutral-400/70 animate-rain-fall"
          style={{
            left: `${8 + i * 9}%`,
            animationDuration: `${0.6 + (i % 3) * 0.15}s`,
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}

function SnowScene() {
  const flakes = Array.from({ length: 9 });
  return (
    <div className="relative h-full w-full">
      <CloudSnow className="absolute left-1/2 top-[16%] h-11 w-11 -translate-x-1/2 text-neutral-100 drop-shadow-[0_0_4px_rgba(255,255,255,0.18)]" />
      {flakes.map((_, i) => (
        <span
          key={i}
          className="absolute top-[48%] h-1.5 w-1.5 rounded-full bg-neutral-100/80 animate-snow-fall"
          style={{
            left: `${6 + i * 10}%`,
            animationDuration: `${3 + (i % 4) * 0.6}s`,
            animationDelay: `${i * 0.3}s`,
          }}
        />
      ))}
    </div>
  );
}

function StormScene() {
  const drops = Array.from({ length: 8 });
  return (
    <div className="relative h-full w-full">
      <Cloud className="absolute left-1/2 top-[14%] h-11 w-11 -translate-x-1/2 text-neutral-300/90" />
      <CloudLightning className="absolute left-1/2 top-[34%] h-8 w-8 -translate-x-1/2 text-amber-300 drop-shadow-glow-caution animate-bolt-flash" />
      {drops.map((_, i) => (
        <span
          key={i}
          className="absolute top-[58%] w-[2px] h-2.5 rounded-full bg-neutral-400/70 animate-rain-fall"
          style={{
            left: `${10 + i * 11}%`,
            animationDuration: `${0.55 + (i % 3) * 0.15}s`,
            animationDelay: `${i * 0.14}s`,
          }}
        />
      ))}
    </div>
  );
}

function NewsPanel({
  title,
  icon,
  refCode,
  items,
  status,
  tier = 'primary',
}: {
  title: string;
  icon: typeof Gauge;
  refCode: string;
  items: NewsItem[];
  status: 'loading' | 'ready' | 'error';
  tier?: 'primary' | 'ambient';
}) {
  return (
    <Panel title={title} icon={icon} refCode={refCode} tier={tier}>
      <div className="flex items-center gap-1.5 pb-3">
        <Radio className="h-3 w-3 text-alert motion-safe:animate-pulse-alert" />
        <span className="text-[10px] uppercase tracking-widest text-alert [text-shadow:var(--glow-text-strong-red)]">Live</span>
      </div>

      {status === 'loading' && (
        <div className="flex flex-col items-center gap-2 py-10 text-neutral-600">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <p className="text-xs uppercase tracking-widest">Acquiring feed...</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-2 py-10 text-amber-400">
          <AlertTriangle className="h-5 w-5" />
          <p className="text-center text-xs uppercase tracking-widest">Feed uplink unavailable</p>
        </div>
      )}

      {status === 'ready' && items.length === 0 && (
        <p className="py-10 text-center text-xs text-neutral-600">No headlines returned.</p>
      )}

      {status === 'ready' && items.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
          {items.map((item, i) => (
            <NewsCard key={`${item.link}-${i}`} item={item} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = item.image && !imgFailed;

  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex gap-2 rounded-md border border-neutral-400/20 bg-invictus-base/40 p-2 shadow-glow-subtle transition-all hover:border-invictus-crimson-bright/60 hover:bg-invictus-crimson-bright/5 hover:shadow-glow-strong"
    >
      <MicroCorners />
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-400/20 bg-invictus-base">
        {showImage ? (
          <img
            src={item.image ?? ''}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <ImageOff className="h-4 w-4 text-neutral-600" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <p className="line-clamp-2 text-xs text-neutral-100 group-hover:text-neutral-50">{item.title}</p>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-600">
          {item.pubDate && <span>{formatRelativeTime(item.pubDate)}</span>}
          <ExternalLink className="h-2.5 w-2.5" />
        </div>
      </div>
    </a>
  );
}

function Panel({
  title,
  icon: Icon,
  refCode,
  tier = 'primary',
  children,
}: {
  title: string;
  icon: typeof Gauge;
  refCode?: string;
  tier?: 'primary' | 'ambient';
  children: React.ReactNode;
}) {
  const isAmbient = tier === 'ambient';
  return (
    <div
      className={
        isAmbient
          ? 'relative flex h-full flex-col border border-neutral-400/10 bg-invictus-base/50 p-6 shadow-glow-none backdrop-blur-xl'
          : 'relative flex h-full flex-col border border-neutral-400/30 bg-invictus-base/50 p-6 shadow-glow-subtle backdrop-blur-xl'
      }
    >
      <HudCorners />
      <div
        className={
          isAmbient
            ? 'mb-4 flex items-center justify-between gap-2 border-b border-neutral-400/15 pb-4'
            : 'mb-4 flex items-center justify-between gap-2 border-b border-neutral-400/20 pb-4'
        }
      >
        <div className="flex items-center gap-2">
          <Icon
            className={
              isAmbient
                ? 'h-4 w-4 text-neutral-500/70'
                : 'h-4 w-4 text-neutral-300 drop-shadow-glow-subtle'
            }
          />
          <h2
            className={
              isAmbient
                ? 'font-display text-[11px] font-normal uppercase tracking-[0.2em] text-neutral-500/70'
                : 'font-display text-sm font-normal uppercase tracking-[0.2em] text-neutral-300 [text-shadow:var(--glow-text-subtle)]'
            }
          >
            {title}
          </h2>
        </div>
        {refCode && <SysRef code={refCode} className="hidden lg:inline-flex" />}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return `${d} ${MONTH_LABELS[m - 1]} ${y}`;
}

function CalendarPage({
  events,
  onAdd,
  onDelete,
  onImport,
}: {
  events: CalendarEvent[];
  onAdd: (event: CalendarEvent) => void;
  onDelete: (id: string) => void;
  onImport: (events: CalendarEvent[]) => number;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(toDateInputValue(today));
  const [priority, setPriority] = useState<Priority>('Medium');
  const [notes, setNotes] = useState('');
  const [repeatFreq, setRepeatFreq] = useState<RecurrenceFreq | 'none'>('none');
  const [repeatUntil, setRepeatUntil] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<{ event: CalendarEvent; occurrenceDate: string } | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [outlookImportMessage, setOutlookImportMessage] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const { playConfirm } = useSound();

  useEffect(() => {
    if (!confirmDeleteId) return;
    const cancel = () => setConfirmDeleteId(null);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`[data-confirm-delete="${confirmDeleteId}"]`)) cancel();
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [confirmDeleteId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;
    if (repeatFreq !== 'none' && !repeatUntil) return;
    onAdd({
      id: genId(),
      title: title.trim(),
      date,
      priority,
      notes: notes.trim(),
      recurrence: repeatFreq !== 'none' ? { freq: repeatFreq, until: repeatUntil } : undefined,
    });
    playConfirm();
    setTitle('');
    setPriority('Medium');
    setNotes('');
    setRepeatFreq('none');
    setRepeatUntil('');
  };

  const handleImportClick = () => {
    const added = onImport(IMPORT_SCHEDULE);
    setImportMessage(added > 0 ? `Imported ${added} entries from your 2026 schedule.` : 'Your 2026 schedule is already imported.');
    playConfirm();
  };

  const handleImportOutlookClick = () => {
    const added = onImport(OUTLOOK_EVENTS);
    setOutlookImportMessage(added > 0 ? `Imported ${added} new invite${added === 1 ? '' : 's'} from Outlook.` : 'No new Outlook invites to import.');
    playConfirm();
  };

  const cells = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
    const totalCells = Math.ceil((leadingBlanks + daysInMonth) / 7) * 7;
    return Array.from({ length: totalCells }, (_, i) => {
      const dayNum = i - leadingBlanks + 1;
      if (dayNum < 1 || dayNum > daysInMonth) return null;
      return toDateInputValue(new Date(viewYear, viewMonth, dayNum));
    });
  }, [viewYear, viewMonth]);

  const eventsByDate = useMemo(() => {
    const visibleDates = cells.filter((c): c is string => !!c);
    if (visibleDates.length === 0) return {};
    const rangeStart = visibleDates[0];
    const rangeEnd = visibleDates[visibleDates.length - 1];
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of events) {
      for (const occurrenceDate of getOccurrencesInRange(ev, rangeStart, rangeEnd)) {
        (map[occurrenceDate] ??= []).push(ev);
      }
    }
    return map;
  }, [events, cells]);

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };

  const todayStr = toDateInputValue(today);

  return (
    <div className="space-y-5">
      <Panel title="New Diary Entry" icon={Plus} refCode="0102-C">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Ansul Meeting"
            className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50 sm:col-span-2 lg:col-span-2"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          >
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes, e.g. it is with Paul A"
            className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          />
          <select
            value={repeatFreq}
            onChange={(e) => setRepeatFreq(e.target.value as RecurrenceFreq | 'none')}
            className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
            title="Repeats"
          >
            <option value="none">Does not repeat</option>
            <option value="weekly">Repeats weekly</option>
            <option value="fortnightly">Repeats fortnightly</option>
            <option value="monthly">Repeats monthly</option>
          </select>
          {repeatFreq !== 'none' && (
            <input
              type="date"
              value={repeatUntil}
              min={date}
              onChange={(e) => setRepeatUntil(e.target.value)}
              required
              title="Repeat until"
              className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
            />
          )}
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong sm:col-span-2 lg:col-span-5"
          >
            <Plus className="h-4 w-4" /> Add to Diary
          </button>
        </form>
      </Panel>

      <Panel title="Bulk Import" icon={Upload} refCode="0102-D">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-neutral-400">
            One-click import of your estate schedule (water meter readings, site safety walks, H&amp;S committee, PKL 1-2-1s and more) for Jun–Dec 2026.
            Safe to click more than once — already-imported entries are skipped.
          </p>
          <button
            onClick={handleImportClick}
            className="flex shrink-0 items-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong"
          >
            <Upload className="h-4 w-4" /> Import 2026 Schedule
          </button>
        </div>
        {importMessage && <p className="mt-3 text-xs text-emerald-400">{importMessage}</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-400/10 pt-4">
          <p className="text-xs text-neutral-400">
            New meeting invites picked up from your Outlook inbox since 22 Jun 2026 that aren&apos;t already on this calendar.
          </p>
          <button
            onClick={handleImportOutlookClick}
            className="flex shrink-0 items-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong"
          >
            <Upload className="h-4 w-4" /> Import Outlook Invites
          </button>
        </div>
        {outlookImportMessage && <p className="mt-3 text-xs text-emerald-400">{outlookImportMessage}</p>}
      </Panel>

      <Panel title={`${MONTH_LABELS[viewMonth]} ${viewYear}`} icon={CalendarDays} refCode="0103-C">
        <div className="mb-4 flex items-center justify-end gap-2">
          <button
            onClick={goToPrevMonth}
            className="rounded-md border border-neutral-400/30 bg-invictus-base/60 p-1.5 text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:bg-invictus-crimson-bright/10 hover:text-invictus-crimson-bright"
            title="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={goToToday}
            className="rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:bg-invictus-crimson-bright/10 hover:text-invictus-crimson-bright"
          >
            Today
          </button>
          <button
            onClick={goToNextMonth}
            className="rounded-md border border-neutral-400/30 bg-invictus-base/60 p-1.5 text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:bg-invictus-crimson-bright/10 hover:text-invictus-crimson-bright"
            title="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Desktop / wide-screen month grid — collapses to an agenda list below lg, since 7 narrow
            columns can't fit readable event titles on phone and fold-device widths. */}
        <div className="hidden grid-cols-7 gap-1.5 lg:grid">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="px-1 pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              {label}
            </div>
          ))}
          {cells.map((cellDate, i) => {
            if (!cellDate) {
              return <div key={`blank-${i}`} className="min-h-[6.5rem] rounded-md border border-transparent" />;
            }
            const dayEvents = eventsByDate[cellDate] ?? [];
            const isToday = cellDate === todayStr;
            const dayNum = Number(cellDate.slice(-2));
            return (
              <div
                key={cellDate}
                className={`relative flex min-h-[6.5rem] flex-col gap-1 rounded-md border p-1.5 ${
                  isToday
                    ? 'border-invictus-crimson-bright bg-invictus-crimson-bright/10 shadow-glow-strong'
                    : 'border-neutral-400/15 bg-invictus-base/40'
                }`}
              >
                <span className={`font-mono text-[11px] ${isToday ? 'font-bold text-invictus-crimson-bright' : 'text-neutral-500'}`}>{dayNum}</span>
                <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
                  {dayEvents.map((ev) => (
                    <div
                      key={ev.id}
                      onClick={() => setSelectedEvent({ event: ev, occurrenceDate: cellDate })}
                      title={ev.notes ? `${ev.title} — ${ev.notes}` : ev.title}
                      className={`group flex cursor-pointer items-start justify-between gap-1.5 rounded border px-1.5 py-1 font-sans text-[11px] leading-snug transition-colors hover:brightness-125 ${PRIORITY_STYLES[ev.priority]}`}
                    >
                      <span className="flex min-w-0 items-start gap-1">
                        {ev.recurrence && <Repeat className="mt-0.5 h-2.5 w-2.5 shrink-0" />}
                        <span className="line-clamp-2 min-w-0">{ev.title}</span>
                      </span>
                      <div className="shrink-0" data-confirm-delete={ev.id}>
                        {confirmDeleteId === ev.id ? (
                          <div className="flex items-center gap-1 pl-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(ev.id);
                                setConfirmDeleteId(null);
                              }}
                              className="rounded border border-alert/50 bg-alert/10 p-0.5 text-alert transition-colors hover:bg-alert/20"
                              title={ev.recurrence ? 'Confirm: delete entire series' : 'Confirm delete'}
                            >
                              <Check className="h-2.5 w-2.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteId(null);
                              }}
                              className="rounded border border-neutral-400/30 p-0.5 text-neutral-400 transition-colors hover:text-neutral-200"
                              title="Cancel"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(ev.id);
                            }}
                            className="rounded p-1 pl-1.5 text-neutral-400 opacity-0 transition-opacity hover:text-alert focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                            title={ev.recurrence ? 'Delete entire series' : 'Delete entry'}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Agenda list — narrow screens get full-width rows instead of cramped grid chips. */}
        <div className="flex flex-col gap-3 lg:hidden">
          {cells.filter((cellDate): cellDate is string => Boolean(cellDate) && (eventsByDate[cellDate!] ?? []).length > 0).length === 0 && (
            <p className="py-6 text-center text-xs text-neutral-500">No diary entries this month.</p>
          )}
          {cells.map((cellDate, i) => {
            if (!cellDate) return null;
            const dayEvents = eventsByDate[cellDate] ?? [];
            if (dayEvents.length === 0) return null;
            const isToday = cellDate === todayStr;
            const dayNum = Number(cellDate.slice(-2));
            const weekdayLabel = WEEKDAY_LABELS[i % 7];
            return (
              <div
                key={cellDate}
                className={`rounded-md border p-2.5 ${
                  isToday
                    ? 'border-invictus-crimson-bright bg-invictus-crimson-bright/10 shadow-glow-strong'
                    : 'border-neutral-400/15 bg-invictus-base/40'
                }`}
              >
                <div className={`mb-2 font-mono text-xs font-semibold uppercase tracking-wide ${isToday ? 'text-invictus-crimson-bright' : 'text-neutral-400'}`}>
                  {weekdayLabel} {dayNum}
                </div>
                <div className="flex flex-col gap-2">
                  {dayEvents.map((ev) => (
                    <div
                      key={ev.id}
                      onClick={() => setSelectedEvent({ event: ev, occurrenceDate: cellDate })}
                      className={`flex cursor-pointer items-start justify-between gap-2 rounded border px-3 py-2.5 font-sans text-sm leading-snug transition-colors active:brightness-125 ${PRIORITY_STYLES[ev.priority]}`}
                    >
                      <span className="flex min-w-0 items-start gap-1.5">
                        {ev.recurrence && <Repeat className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                        <span className="min-w-0">{ev.title}</span>
                      </span>
                      <div className="shrink-0" data-confirm-delete={ev.id}>
                        {confirmDeleteId === ev.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(ev.id);
                                setConfirmDeleteId(null);
                              }}
                              className="rounded border border-alert/50 bg-alert/10 p-1.5 text-alert transition-colors active:bg-alert/20"
                              title={ev.recurrence ? 'Confirm: delete entire series' : 'Confirm delete'}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteId(null);
                              }}
                              className="rounded border border-neutral-400/30 p-1.5 text-neutral-400 transition-colors active:text-neutral-200"
                              title="Cancel"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(ev.id);
                            }}
                            className="rounded p-1.5 text-neutral-400 transition-colors active:text-alert"
                            title={ev.recurrence ? 'Delete entire series' : 'Delete entry'}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="relative w-full max-w-sm border border-invictus-crimson-bright/40 bg-invictus-base/95 p-5 shadow-glow-strong"
            onClick={(e) => e.stopPropagation()}
          >
            <HudCorners />
            <button
              onClick={() => setSelectedEvent(null)}
              className="absolute right-3 top-3 text-neutral-500 transition-colors hover:text-neutral-200"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <Kicker>Diary Entry</Kicker>
            <h3 className="mt-1 flex items-center gap-1.5 pr-6 text-base font-semibold text-neutral-100">
              {selectedEvent.event.recurrence && <Repeat className="h-3.5 w-3.5 shrink-0 text-neutral-400" />}
              {selectedEvent.event.title}
            </h3>
            <div className="mt-3 space-y-2.5 text-sm">
              <div className="flex items-center gap-2 text-neutral-300">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>{formatDisplayDate(selectedEvent.occurrenceDate)}</span>
              </div>
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLES[selectedEvent.event.priority]}`}
              >
                {selectedEvent.event.priority} Priority
              </span>
              {selectedEvent.event.recurrence && (
                <p className="text-[11px] uppercase tracking-wide text-neutral-500">
                  Repeats {selectedEvent.event.recurrence.freq} until {formatDisplayDate(selectedEvent.event.recurrence.until)}
                </p>
              )}
              <p className="rounded-md border border-neutral-400/20 bg-invictus-base/60 p-2 text-xs text-neutral-200">
                {selectedEvent.event.notes || 'No notes added.'}
              </p>
            </div>
            <button
              onClick={() => {
                onDelete(selectedEvent.event.id);
                setSelectedEvent(null);
              }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-alert/40 bg-alert/10 py-2 text-xs font-semibold uppercase tracking-widest text-alert transition-all hover:bg-alert/20 hover:shadow-glow-alert"
            >
              <Trash2 className="h-3.5 w-3.5" /> {selectedEvent.event.recurrence ? 'Delete Entire Series' : 'Delete Entry'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Site Map
// ---------------------------------------------------------------------------

// Geometry traced from the official Dreamland Margate site plan, normalised to a
// 1000 x 900 SVG viewBox (north = top). The boundary, roads and car park come
// from the plan; the operational zones (Ingress, Roller Area, Food Court, Scenic
// Stage/Railway, Boneyard, Bars storage, Rides, etc.) are the user's working
// layout for the event build.
type Pt = [number, number];

const SITE_BOUNDARY: Pt[] = [
  [19, 144], [300, 126], [644, 127], [853, 465], [965, 705],
  [706, 858], [420, 773], [290, 674], [64, 386],
];
const CAR_PARK_POLY: Pt[] = [[426, 220], [644, 127], [853, 465], [486, 457]];
const EAST_PARK_POLY: Pt[] = [[648, 470], [812, 360], [905, 600], [800, 720], [690, 612]];
const CLUSTER_POLY: Pt[] = [
  [30, 148], [330, 150], [348, 230], [330, 300], [250, 358], [110, 360], [55, 300], [30, 205],
];

type ZoneTone = 'area' | 'storage' | 'building';
interface SiteZone {
  label: string;
  x: number; y: number; w: number; h: number;
  rot?: number;       // box rotation (deg)
  labelRot?: number;  // text rotation (deg) — defaults to rot
  tone?: ZoneTone;
  noBadge?: boolean;  // skip task badge (for duplicate-labelled boxes)
}

// Working zones, positioned to match the user's marked-up plan.
const SITE_ZONES: SiteZone[] = [
  // Frontage / peripheral buildings (sit north of the boundary, still clickable)
  { label: 'Cinema', x: 30, y: 44, w: 84, h: 34, tone: 'building' },
  { label: 'Cinque Ports', x: 143, y: 57, w: 62, h: 47, tone: 'building' },
  { label: 'Ballroom', x: 33, y: 146, w: 58, h: 55, tone: 'building' },
  { label: 'Hall by the Sea', x: 71, y: 251, w: 62, h: 89, tone: 'building' },
  // Operational areas
  { label: 'Concourse', x: 96, y: 150, w: 46, h: 50, tone: 'area' },
  { label: 'Ingress', x: 176, y: 152, w: 152, h: 45, tone: 'area' },
  { label: 'Roller Area', x: 138, y: 205, w: 188, h: 63, tone: 'area' },
  { label: 'Transit Area', x: 170, y: 287, w: 93, h: 57, tone: 'area' },
  { label: 'Food Court', x: 198, y: 352, w: 100, h: 183, tone: 'area' },
  { label: 'Scenic Stage', x: 301, y: 352, w: 42, h: 183, tone: 'area', labelRot: -90 },
  { label: 'Scenic Railway', x: 346, y: 352, w: 59, h: 185, tone: 'area', labelRot: -90 },
  { label: 'Scenic Railway', x: 341, y: 214, w: 62, h: 89, tone: 'area', labelRot: -90, noBadge: true },
  { label: 'Shed', x: 331, y: 306, w: 84, h: 26, tone: 'area' },
  { label: 'Teddy & Betty / Ark', x: 442, y: 348, w: 62, h: 148, rot: -28, tone: 'area' },
  { label: 'VIP', x: 128, y: 375, w: 44, h: 80, rot: -50, tone: 'area' },
  { label: 'Container Toilets', x: 318, y: 566, w: 100, h: 34, tone: 'area' },
  // Rides (several pitches share the label)
  { label: 'Rides', x: 430, y: 520, w: 80, h: 44, tone: 'area' },
  { label: 'Rides', x: 458, y: 580, w: 54, h: 80, tone: 'area', noBadge: true },
  { label: 'Rides', x: 392, y: 700, w: 92, h: 32, tone: 'area', noBadge: true },
  { label: 'Rides', x: 325, y: 634, w: 128, h: 46, rot: -34, tone: 'area', noBadge: true },
  { label: 'Rides', x: 250, y: 560, w: 66, h: 27, tone: 'area', noBadge: true },
  // Logistics (SE)
  { label: 'Boneyard', x: 660, y: 405, w: 150, h: 388, tone: 'storage' },
  { label: 'Bars storage', x: 505, y: 662, w: 148, h: 126, tone: 'storage' },
];

function pointInPolygon(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Corner polygon of a (possibly rotated) zone rect, for cell hit-testing.
function zoneCorners(z: SiteZone): Pt[] {
  const cx = z.x + z.w / 2;
  const cy = z.y + z.h / 2;
  const t = ((z.rot ?? 0) * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const local: Pt[] = [
    [-z.w / 2, -z.h / 2], [z.w / 2, -z.h / 2], [z.w / 2, z.h / 2], [-z.w / 2, z.h / 2],
  ];
  return local.map(([dx, dy]) => [cx + dx * c - dy * s, cy + dx * s + dy * c] as Pt);
}

const SITE_FEATURES: { label: string; poly: Pt[]; cx: number; cy: number }[] =
  SITE_ZONES.map((z) => ({ label: z.label, poly: zoneCorners(z), cx: z.x + z.w / 2, cy: z.y + z.h / 2 }));

const GRID_COLS = 14;
const GRID_ROWS = 12;
const CELL_W = 1000 / GRID_COLS;
const CELL_H = 900 / GRID_ROWS;
const COL_LETTERS = 'ABCDEFGHIJKLMN';

interface GridCell {
  col: number; row: number; ref: string;
  x: number; y: number; cx: number; cy: number;
  inside: boolean; landmark: string | null; areaKey: string;
}
const SITE_CELLS: GridCell[] = (() => {
  const cells: GridCell[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const x = col * CELL_W;
      const y = row * CELL_H;
      const cx = x + CELL_W / 2;
      const cy = y + CELL_H / 2;
      // Resolve which zone a square belongs to. Pass 1: cell centre sits inside
      // a zone (handles normal-sized zones). Pass 2: the zone's centre or a
      // corner falls inside this square — this catches thin/small zones (Shed,
      // Container Toilets, the frontage Cinema / Cinque Ports) whose overlapping
      // square has its centre just outside the box. Array order breaks ties.
      const inCell = (px: number, py: number) => px >= x && px <= x + CELL_W && py >= y && py <= y + CELL_H;
      const landmark =
        SITE_FEATURES.find((f) => pointInPolygon(cx, cy, f.poly))?.label ??
        SITE_FEATURES.find((f) => inCell(f.cx, f.cy))?.label ??
        SITE_FEATURES.find((f) => f.poly.some(([px, py]) => inCell(px, py)))?.label ??
        null;
      // A square is clickable if it's inside the site boundary OR over a named zone.
      const inside = pointInPolygon(cx, cy, SITE_BOUNDARY) || landmark !== null;
      const ref = `${COL_LETTERS[col]}${row + 1}`;
      cells.push({ col, row, ref, x, y, cx, cy, inside, landmark, areaKey: landmark ?? `Grid ${ref}` });
    }
  }
  return cells;
})();

// SVG palette (kept in the black & red INVICTUS theme).
const MAP_C = {
  crimson: '#dc2626',
  line: 'rgba(220,38,38,0.30)',
  lineStrong: 'rgba(220,38,38,0.45)',
  boundaryFill: '#16171c',
  passive: '#1d1e23',
  passiveStroke: 'rgba(160,160,170,0.18)',
  green: 'rgba(16,185,129,0.10)',
  greenStroke: 'rgba(16,185,129,0.30)',
  label: '#d4d4d4',
  labelDim: '#8a8a8a',
};

const ZONE_TONE: Record<ZoneTone, { fill: string; stroke: string; text: string }> = {
  area: { fill: 'rgba(220,38,38,0.16)', stroke: '#dc2626', text: '#f1d2d2' },
  storage: { fill: 'rgba(220,38,38,0.09)', stroke: 'rgba(220,38,38,0.65)', text: '#e6c3c3' },
  building: { fill: 'rgba(120,20,24,0.32)', stroke: '#dc2626', text: '#e9bcbc' },
};

function toPoints(poly: Pt[]): string {
  return poly.map(([x, y]) => `${x},${y}`).join(' ');
}

function SiteMapPage({
  tasks,
  onAddTask,
}: {
  tasks: Task[];
  onAddTask: (task: Task) => void;
}) {
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [hoverRef, setHoverRef] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [dueDate, setDueDate] = useState('');
  const { playConfirm } = useSound();

  const selectedCell = SITE_CELLS.find((c) => c.ref === selectedRef) ?? null;

  const activeCountByArea = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      if (t.area && t.status !== 'Completed') counts[t.area] = (counts[t.area] ?? 0) + 1;
    }
    return counts;
  }, [tasks]);

  const tasksForArea = useMemo(
    () => (selectedCell ? tasks.filter((t) => t.area === selectedCell.areaKey) : []),
    [tasks, selectedCell]
  );

  const handleAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCell || !name.trim()) return;
    onAddTask({
      id: genId(),
      name: name.trim(),
      priority,
      dueDate,
      status: 'Not Started',
      area: selectedCell.areaKey,
    });
    playConfirm();
    setName('');
    setPriority('Medium');
    setDueDate('');
  };

  const cellFill = (cell: GridCell): string => {
    if (cell.ref === selectedRef) return 'rgba(220,38,38,0.42)';
    if (cell.ref === hoverRef) return 'rgba(220,38,38,0.22)';
    return 'rgba(220,38,38,0.03)';
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.85fr_1fr]">
        <Panel title="Dreamland Site Map" icon={MapIcon} refCode="0106-M">
          <p className="mb-3 text-xs text-neutral-500">
            Click a grid square to assign a task to that part of the site. Squares over a named
            area (Food Court, Boneyard, Scenic Railway&hellip;) tag the task with that area; open
            ground tags a grid reference. Assigned tasks flow straight into Task Manager.
          </p>
          <div className="relative w-full overflow-hidden rounded-md border border-neutral-400/20 bg-[#0b0b0c]">
            <svg viewBox="0 0 1000 900" className="h-auto w-full" role="img" aria-label="Dreamland site map grid">
              {/* Site boundary */}
              <polygon points={toPoints(SITE_BOUNDARY)} fill={MAP_C.boundaryFill} stroke={MAP_C.crimson} strokeWidth={2} strokeLinejoin="round" />

              {/* Passive context areas */}
              <polygon points={toPoints(CAR_PARK_POLY)} fill={MAP_C.passive} stroke={MAP_C.passiveStroke} strokeWidth={1} />
              <polygon points={toPoints(EAST_PARK_POLY)} fill={MAP_C.green} stroke={MAP_C.greenStroke} strokeWidth={1} />
              <polygon points={toPoints(CLUSTER_POLY)} fill={MAP_C.passive} stroke={MAP_C.passiveStroke} strokeWidth={1} />

              {/* Working zones */}
              {SITE_ZONES.map((z, i) => {
                const cx = z.x + z.w / 2;
                const cy = z.y + z.h / 2;
                const tone = ZONE_TONE[z.tone ?? 'area'];
                const transform = z.rot ? `rotate(${z.rot} ${cx} ${cy})` : undefined;
                return (
                  <rect
                    key={`zone-${i}`}
                    x={z.x}
                    y={z.y}
                    width={z.w}
                    height={z.h}
                    rx={2}
                    fill={tone.fill}
                    stroke={tone.stroke}
                    strokeWidth={1.2}
                    transform={transform}
                  />
                );
              })}

              {/* Roads */}
              <line x1={19} y1={132} x2={644} y2={114} stroke="rgba(180,180,190,0.35)" strokeWidth={3} />
              <line x1={644} y1={127} x2={965} y2={520} stroke="rgba(180,180,190,0.35)" strokeWidth={3} />

              {/* Context labels */}
              <g fontFamily="inherit" textAnchor="middle" style={{ textTransform: 'uppercase' }}>
                <text x={330} y={104} fontSize={12} letterSpacing={2} fill={MAP_C.labelDim}>Hall by the Sea Road</text>
                <text x={812} y={300} fontSize={12} letterSpacing={2} fill={MAP_C.labelDim} transform="rotate(58 812 300)">Belgrave Road</text>
                <text x={70} y={500} fontSize={11} fill={MAP_C.labelDim}>Arlington Car Park</text>
                <text x={600} y={300} fontSize={11} fontWeight={600} fill={MAP_C.labelDim}>Dreamland Car Park</text>
                <text x={70} y={120} fontSize={8} fill={MAP_C.crimson}>Undercover Entrance</text>
              </g>

              {/* Zone labels */}
              <g fontFamily="inherit" textAnchor="middle" style={{ textTransform: 'uppercase' }}>
                {SITE_ZONES.map((z, i) => {
                  const cx = z.x + z.w / 2;
                  const cy = z.y + z.h / 2;
                  const tone = ZONE_TONE[z.tone ?? 'area'];
                  const lr = z.labelRot ?? z.rot ?? 0;
                  const fs = z.w < 78 || z.h < 32 ? 7.5 : 9;
                  return (
                    <text
                      key={`zlbl-${i}`}
                      x={cx}
                      y={cy + 3}
                      fontSize={fs}
                      fontWeight={600}
                      letterSpacing={0.5}
                      fill={tone.text}
                      transform={lr ? `rotate(${lr} ${cx} ${cy})` : undefined}
                    >
                      {z.label}
                    </text>
                  );
                })}
              </g>

              {/* Undercover entrance marker */}
              <circle cx={64} cy={128} r={4} fill={MAP_C.crimson} />

              {/* Grid lines */}
              <g stroke={MAP_C.line} strokeWidth={1}>
                {Array.from({ length: GRID_COLS - 1 }, (_, i) => (
                  <line key={`v${i}`} x1={(i + 1) * CELL_W} y1={0} x2={(i + 1) * CELL_W} y2={900} />
                ))}
                {Array.from({ length: GRID_ROWS - 1 }, (_, i) => (
                  <line key={`h${i}`} x1={0} y1={(i + 1) * CELL_H} x2={1000} y2={(i + 1) * CELL_H} />
                ))}
              </g>

              {/* Clickable cells (inside boundary only) */}
              {SITE_CELLS.filter((c) => c.inside).map((cell) => (
                <rect
                  key={cell.ref}
                  x={cell.x}
                  y={cell.y}
                  width={CELL_W}
                  height={CELL_H}
                  fill={cellFill(cell)}
                  stroke={cell.ref === selectedRef ? MAP_C.crimson : MAP_C.lineStrong}
                  strokeWidth={cell.ref === selectedRef ? 2 : 0.75}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverRef(cell.ref)}
                  onMouseLeave={() => setHoverRef((r) => (r === cell.ref ? null : r))}
                  onClick={() => setSelectedRef(cell.ref)}
                />
              ))}

              {/* Task-count badges on named zones */}
              {SITE_ZONES.filter((z) => !z.noBadge && (activeCountByArea[z.label] ?? 0) > 0).map((z, i) => (
                <g key={`badge-${i}`} pointerEvents="none">
                  <circle cx={z.x + z.w / 2} cy={z.y + z.h / 2 - 14} r={9} fill={MAP_C.crimson} stroke="#fff" strokeWidth={0.8} />
                  <text x={z.x + z.w / 2} y={z.y + z.h / 2 - 10.5} fontSize={11} fontWeight={700} fill="#fff" textAnchor="middle">
                    {activeCountByArea[z.label]}
                  </text>
                </g>
              ))}
              {/* Badges on grid-reference cells that carry tasks */}
              {SITE_CELLS.filter((c) => c.inside && !c.landmark && (activeCountByArea[c.areaKey] ?? 0) > 0).map((cell) => (
                <g key={`gbadge-${cell.ref}`} pointerEvents="none">
                  <circle cx={cell.cx} cy={cell.cy} r={9} fill={MAP_C.crimson} stroke="#fff" strokeWidth={0.8} />
                  <text x={cell.cx} y={cell.cy + 3.5} fontSize={11} fontWeight={700} fill="#fff" textAnchor="middle">
                    {activeCountByArea[cell.areaKey]}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 shrink-0 rounded-[2px] border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/20" />
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">Working Area</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 shrink-0 rounded-[2px] border border-invictus-crimson-bright/50 bg-[#78141880]" />
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">Building</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 shrink-0 rounded-[2px] border border-neutral-400/25 bg-neutral-700/40" />
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">Car Park</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-invictus-crimson-bright text-[8px] font-bold text-white">1</span>
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">Tasks assigned</span>
            </div>
          </div>
        </Panel>

        <Panel title={selectedCell ? (selectedCell.landmark ?? `Grid ${selectedCell.ref}`) : 'Grid Square'} icon={MapPin} refCode="0107-M">
          {!selectedCell ? (
            <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 text-center">
              <MapPin className="h-8 w-8 text-neutral-700" />
              <p className="text-xs text-neutral-500">
                Click a grid square on the map to view its tasks and assign new ones.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-neutral-400/40 bg-neutral-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-300">
                    Square {selectedCell.ref}
                  </span>
                  {selectedCell.landmark && (
                    <span className="rounded-full border border-invictus-crimson-bright/50 bg-invictus-crimson-bright/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-100">
                      {selectedCell.landmark}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setSelectedRef(null)}
                  className="rounded-md border border-neutral-400/30 bg-invictus-base/60 p-1 text-neutral-400 transition-colors hover:text-invictus-crimson-bright"
                  title="Clear selection"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div>
                <Kicker>Tasks here ({tasksForArea.length})</Kicker>
                <div className="mt-2 space-y-1.5">
                  {tasksForArea.length === 0 && (
                    <p className="py-2 text-xs text-neutral-600">No tasks assigned to this location yet.</p>
                  )}
                  {tasksForArea.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-neutral-400/20 bg-invictus-base/40 px-2.5 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-xs text-neutral-200">{t.name}</span>
                      <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${STATUS_STYLES[t.status]}`}>
                        {t.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <form onSubmit={handleAssign} className="flex flex-col gap-2 border-t border-neutral-400/15 pt-4">
                <Kicker>Assign a task to {selectedCell.areaKey}</Kicker>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Task name"
                  className="w-full rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:shadow-glow-strong focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as Priority)}
                    className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:shadow-glow-strong focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
                  >
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:shadow-glow-strong focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
                  />
                </div>
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong"
                >
                  <Plus className="h-4 w-4" /> Assign Task
                </button>
                <p className="text-center text-[10px] text-neutral-600">
                  Appears in Task Manager, tagged <span className="text-neutral-400">{selectedCell.areaKey}</span>.
                </p>
              </form>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task Manager
// ---------------------------------------------------------------------------

function TaskManager({
  tasks,
  archivedTasks,
  onAdd,
  onUpdateStatus,
  onDelete,
  onArchive,
  onArchiveAllCompleted,
  onAddPendingReturn,
  onAddInboxTasks,
  onAddOutlookTasks,
}: {
  tasks: Task[];
  archivedTasks: Task[];
  onAdd: (task: Task) => void;
  onUpdateStatus: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onArchiveAllCompleted: () => void;
  onAddPendingReturn: () => void;
  onAddInboxTasks: () => void;
  onAddOutlookTasks: () => void;
}) {
  const completedCount = tasks.filter((t) => t.status === 'Completed').length;
  // A seed item counts as "already handled" if it's in the live list OR sitting in
  // the archive — otherwise archiving a quick-add task makes its button reappear and
  // re-adding it resurrects the archived task. Match by name, case-insensitive.
  const isAlreadyTracked = (seedName: string) => {
    const key = seedName.trim().toLowerCase();
    return (
      tasks.some((t) => t.name.trim().toLowerCase() === key) ||
      archivedTasks.some((t) => t.name.trim().toLowerCase() === key)
    );
  };
  const pendingReturnCount = PENDING_RETURN_TASKS.filter((p) => !isAlreadyTracked(p.name)).length;
  const inboxTaskCount = INBOX_TASKS.filter((i) => !isAlreadyTracked(i.name)).length;
  const outlookTaskCount = OUTLOOK_TASKS.filter((o) => !isAlreadyTracked(o.name)).length;
  const todayStr = toDateInputValue(new Date());
  const isOverdueOrToday = (t: Task) =>
    t.status !== 'Completed' && Boolean(t.dueDate) && daysFromToday(t.dueDate, todayStr) <= 0;
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aPinned = isOverdueOrToday(a) ? 0 : 1;
      const bPinned = isOverdueOrToday(b) ? 0 : 1;
      if (aPinned !== bPinned) return aPinned - bPinned;
      if (a.priority !== b.priority) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (a.dueDate !== b.dueDate) {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate < b.dueDate ? -1 : 1;
      }
      return 0;
    });
  }, [tasks, todayStr]);
  // Split the sorted list into status groups (Not Started → In Progress → Completed)
  // so the queue is easier to manage at a glance. Within each group the existing
  // urgency/priority/due-date sort is preserved.
  const groupedTasks = useMemo(
    () =>
      STATUS_ORDER.map((status) => ({
        status,
        items: sortedTasks.filter((t) => t.status === status),
      })).filter((group) => group.items.length > 0),
    [sortedTasks]
  );
  const [name, setName] = useState('');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<TaskStatus>('Not Started');
  const { playConfirm } = useSound();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ id: genId(), name: name.trim(), priority, dueDate, status });
    playConfirm();
    setName('');
    setPriority('Medium');
    setDueDate('');
    setStatus('Not Started');
  };

  return (
    <div className="space-y-5">
      <Panel title="Deploy New Task" icon={Plus} refCode="0103-T">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Task name"
            className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50 sm:col-span-2 lg:col-span-2"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          >
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
            className="w-full min-w-0 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          >
            <option>Not Started</option>
            <option>In Progress</option>
            <option>Completed</option>
          </select>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong sm:col-span-2 lg:col-span-5"
          >
            <Plus className="h-4 w-4" /> Add Task
          </button>
        </form>
        {pendingReturnCount > 0 && (
          <button
            onClick={onAddPendingReturn}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-neutral-400/30 bg-invictus-base/60 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:bg-invictus-crimson-bright/10 hover:text-invictus-crimson-bright"
          >
            <ListChecks className="h-3.5 w-3.5" /> Add {pendingReturnCount} Pending Task{pendingReturnCount === 1 ? '' : 's'}
          </button>
        )}
        {inboxTaskCount > 0 && (
          <button
            onClick={onAddInboxTasks}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-neutral-400/30 bg-invictus-base/60 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:bg-invictus-crimson-bright/10 hover:text-invictus-crimson-bright"
          >
            <ListChecks className="h-3.5 w-3.5" /> Add {inboxTaskCount} Inbox Task{inboxTaskCount === 1 ? '' : 's'}
          </button>
        )}
        {outlookTaskCount > 0 && (
          <button
            onClick={onAddOutlookTasks}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-neutral-400/30 bg-invictus-base/60 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:bg-invictus-crimson-bright/10 hover:text-invictus-crimson-bright"
          >
            <ListChecks className="h-3.5 w-3.5" /> Add {outlookTaskCount} Outlook Task{outlookTaskCount === 1 ? '' : 's'}
          </button>
        )}
      </Panel>

      <Panel title={`Active Tasks (${tasks.length})`} icon={ListChecks} refCode="0104-T">
        <div className="space-y-2">
          {completedCount > 0 && (
            <button
              onClick={onArchiveAllCompleted}
              className="mb-1 flex w-full items-center justify-center gap-2 rounded-md border border-neutral-400/30 bg-invictus-base/60 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:bg-invictus-crimson-bright/10 hover:text-invictus-crimson-bright"
            >
              <Archive className="h-3.5 w-3.5" /> Archive {completedCount} Completed
            </button>
          )}
          {tasks.length === 0 && (
            <p className="py-8 text-center text-xs text-neutral-600">No tasks in queue.</p>
          )}
          {groupedTasks.map((group) => (
            <div key={group.status} className="space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${STATUS_STYLES[group.status]}`}>
                  {group.status}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-600">
                  {group.items.length}
                </span>
                <span className="h-px flex-1 bg-neutral-400/10" />
              </div>
              {group.items.map((task) => {
                const isPinned = isOverdueOrToday(task);
                return (
            <div
              key={task.id}
              className={`relative flex flex-col gap-3 rounded-md border p-3 shadow-glow-subtle md:flex-row md:items-center md:justify-between ${
                isPinned ? 'border-alert/50 bg-alert/5 shadow-glow-alert' : 'border-neutral-400/20 bg-invictus-base/40'
              }`}
            >
              <MicroCorners />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-neutral-100">{task.name}</p>
                <Kicker>Due {task.dueDate || '—'}</Kicker>
                {task.notes && <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{task.notes}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isPinned && (
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${URGENCY_STYLES.red}`}>
                    {formatDueIn(daysFromToday(task.dueDate, todayStr))}
                  </span>
                )}
                {task.category && (
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CATEGORY_TAG_STYLE}`}>
                    {task.category}
                  </span>
                )}
                {task.area && (
                  <span className="flex items-center gap-1 rounded-full border border-invictus-crimson-bright/40 bg-invictus-crimson-bright/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-200">
                    <MapPin className="h-3 w-3" /> {task.area}
                  </span>
                )}
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLES[task.priority]}`}>
                  {task.priority}
                </span>
                <select
                  value={task.status}
                  onChange={(e) => onUpdateStatus(task.id, e.target.value as TaskStatus)}
                  className={`rounded-md border bg-black/40 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide focus:outline-none ${STATUS_STYLES[task.status]}`}
                >
                  <option>Not Started</option>
                  <option>In Progress</option>
                  <option>Completed</option>
                </select>
                {task.status === 'Completed' && (
                  <button
                    onClick={() => onArchive(task.id)}
                    className="rounded-md border border-neutral-400/30 bg-invictus-base/60 p-1.5 text-neutral-300 transition-all hover:border-invictus-crimson-bright/40 hover:bg-invictus-crimson-bright/10 hover:text-invictus-crimson-bright"
                    title="Archive task"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => onDelete(task.id)}
                  className="rounded-md border border-alert/30 bg-alert/10 p-1.5 text-alert transition-all hover:bg-alert/20 hover:shadow-glow-alert"
                  title="Delete task"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
                );
              })}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task Archive
// ---------------------------------------------------------------------------

function TaskArchive({
  archivedTasks,
  onRestore,
  onDelete,
}: {
  archivedTasks: Task[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const sorted = [...archivedTasks].sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));

  return (
    <div className="space-y-5">
      <Panel title={`Archived Tasks (${archivedTasks.length})`} icon={Archive} refCode="0105-T">
        <div className="space-y-2">
          {sorted.length === 0 && (
            <p className="py-8 text-center text-xs text-neutral-600">
              No archived tasks yet — completed tasks you archive from Task Manager will show up here.
            </p>
          )}
          {sorted.map((task) => (
            <div
              key={task.id}
              className="relative flex flex-col gap-3 rounded-md border border-neutral-400/20 bg-invictus-base/40 shadow-glow-subtle p-3 md:flex-row md:items-center md:justify-between"
            >
              <MicroCorners />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-neutral-400">{task.name}</p>
                <Kicker>
                  Archived {task.archivedAt ? new Date(task.archivedAt).toLocaleDateString() : '—'}
                </Kicker>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLES[task.priority]}`}>
                  {task.priority}
                </span>
                <button
                  onClick={() => onRestore(task.id)}
                  className="rounded-md border border-neutral-400/30 bg-invictus-base/60 p-1.5 text-neutral-300 transition-all hover:border-invictus-crimson-bright/40 hover:bg-invictus-crimson-bright/10 hover:text-invictus-crimson-bright"
                  title="Restore to active tasks"
                >
                  <ArchiveRestore className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onDelete(task.id)}
                  className="rounded-md border border-alert/30 bg-alert/10 p-1.5 text-alert transition-all hover:bg-alert/20 hover:shadow-glow-alert"
                  title="Delete permanently"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

const REPORT_KIND_STYLES: Record<ReportEntry['kind'], string> = {
  task: 'text-invictus-crimson-bright border-invictus-crimson-bright/40 bg-invictus-crimson-bright/10',
  compliance: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10',
};

function formatCompletedStamp(entry: ReportEntry): string {
  const d = new Date(entry.completedAt);
  const datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (!entry.hasTimeOfDay) return datePart;
  const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

async function exportReportsToPdf(entries: ReportEntry[]) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const crimson: [number, number, number] = [194, 48, 74];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...crimson);
  doc.text('I.N.V.I.C.T.U.S. — Completion Reports', 40, 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(`Generated ${new Date().toLocaleString('en-GB')} · ${entries.length} entries`, 40, 60);

  autoTable(doc, {
    startY: 76,
    head: [['Type', 'Name', 'Completed', 'Priority / Status', 'Details']],
    body: entries.map((entry) => [
      entry.kind === 'task' ? 'Task' : 'Compliance',
      entry.name,
      `${formatCompletedStamp(entry)}${!entry.hasTimeOfDay ? ' (date only)' : ''}`,
      entry.kind === 'task' ? entry.priority ?? '—' : 'Completed',
      entry.kind === 'task'
        ? entry.dueDate ? `Due ${entry.dueDate}` : '—'
        : [entry.nextDueDate ? `Next due ${entry.nextDueDate}` : null, entry.comments]
            .filter(Boolean)
            .join(' · ') || '—',
    ]),
    headStyles: { fillColor: crimson, textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5, textColor: [40, 40, 40] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { left: 40, right: 40 },
  });

  doc.save(`invictus-completion-reports-${toDateInputValue(new Date())}.pdf`);
}

function ReportsPage({
  tasks,
  archivedTasks,
  compliances,
}: {
  tasks: Task[];
  archivedTasks: Task[];
  compliances: ComplianceItem[];
}) {
  const [filter, setFilter] = useState<'all' | 'task' | 'compliance'>('all');
  const [query, setQuery] = useState('');

  const allEntries = useMemo(
    () => buildReportLog(tasks, archivedTasks, compliances),
    [tasks, archivedTasks, compliances]
  );

  const entries = allEntries.filter((entry) => {
    if (filter !== 'all' && entry.kind !== filter) return false;
    if (query.trim() && !entry.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });

  const taskCount = allEntries.filter((e) => e.kind === 'task').length;
  const complianceCount = allEntries.filter((e) => e.kind === 'compliance').length;

  return (
    <div className="space-y-5">
      <Panel title="Completion Reports" icon={FileText} refCode="0110-R">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-400/15 pb-4">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-xs text-neutral-300">
              <span className="h-2 w-2 rounded-full bg-invictus-crimson-bright shadow-glow-subtle" />
              <span className="font-mono font-bold tabular-nums">{taskCount}</span> Tasks
            </span>
            <span className="flex items-center gap-1.5 text-xs text-neutral-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-glow-subtle" />
              <span className="font-mono font-bold tabular-nums">{complianceCount}</span> Compliance
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-600" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search reports..."
                className="w-44 rounded-md border border-neutral-400/30 bg-invictus-base/60 py-1.5 pl-8 pr-3 text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
              />
            </div>
            <div className="flex overflow-hidden rounded-md border border-neutral-400/30">
              {(['all', 'task', 'compliance'] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                    filter === key
                      ? 'bg-invictus-crimson-bright/20 text-invictus-crimson-bright'
                      : 'bg-invictus-base/60 text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  {key === 'all' ? 'All' : key === 'task' ? 'Tasks' : 'Compliance'}
                </button>
              ))}
            </div>
            <button
              onClick={() => exportReportsToPdf(entries)}
              disabled={entries.length === 0}
              className="flex items-center gap-1.5 rounded-md border border-invictus-crimson-bright/40 bg-invictus-crimson-bright/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-invictus-crimson-bright transition-colors hover:bg-invictus-crimson-bright/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-invictus-crimson-bright/10"
            >
              <Download className="h-3 w-3" />
              Export PDF
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {entries.length === 0 && (
            <p className="py-8 text-center text-xs text-neutral-600">
              {allEntries.length === 0
                ? 'No completions logged yet — completed tasks and compliance items will show up here.'
                : 'No reports match your filters.'}
            </p>
          )}
          {entries.map((entry) => {
            const Icon = entry.kind === 'task' ? ListChecks : ShieldCheck;
            return (
              <div
                key={entry.id}
                className="relative flex flex-col gap-3 rounded-md border border-neutral-400/20 bg-invictus-base/40 shadow-glow-subtle p-3 md:flex-row md:items-start md:justify-between"
              >
                <MicroCorners />
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${REPORT_KIND_STYLES[entry.kind]}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-neutral-100">{entry.name}</p>
                    <Kicker>
                      Completed {formatCompletedStamp(entry)}
                      {!entry.hasTimeOfDay ? ' (date only)' : ''}
                    </Kicker>
                    {entry.kind === 'compliance' && entry.comments && (
                      <p className="mt-1 text-xs text-neutral-500">{entry.comments}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:shrink-0">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${REPORT_KIND_STYLES[entry.kind]}`}>
                    {entry.kind === 'task' ? 'Task' : 'Compliance'}
                  </span>
                  {entry.kind === 'task' && entry.priority && (
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLES[entry.priority]}`}>
                      {entry.priority}
                    </span>
                  )}
                  {entry.kind === 'task' && entry.dueDate && (
                    <Kicker>Due {entry.dueDate}</Kicker>
                  )}
                  {entry.kind === 'compliance' && entry.nextDueDate && (
                    <Kicker>Next due {entry.nextDueDate}</Kicker>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compliance Tracker
// ---------------------------------------------------------------------------

function ComplianceTracker({
  compliances,
  onAdd,
  onToggle,
  onChangeDate,
  onChangeNextDueDate,
  onChangeComments,
  onDelete,
  onAddMissingStandard,
}: {
  compliances: ComplianceItem[];
  onAdd: (item: ComplianceItem) => void;
  onToggle: (id: string) => void;
  onChangeDate: (id: string, date: string) => void;
  onChangeNextDueDate: (id: string, date: string) => void;
  onChangeComments: (id: string, comments: string) => void;
  onDelete: (id: string) => void;
  onAddMissingStandard: () => void;
}) {
  const missingStandardCount = SEED_COMPLIANCES.filter(
    (seed) => !compliances.some((c) => c.name.trim().toLowerCase() === seed.name.trim().toLowerCase())
  ).length;
  // Group items by division for display, keeping COMPLIANCE_DIVISION_ORDER first
  // and appending any unexpected division at the end. Empty divisions are hidden.
  const divisionGroups = useMemo(() => {
    const byDivision = new Map<string, ComplianceItem[]>();
    for (const item of compliances) {
      const division = classifyComplianceDivision(item.name);
      const bucket = byDivision.get(division);
      if (bucket) bucket.push(item);
      else byDivision.set(division, [item]);
    }
    const ordered = COMPLIANCE_DIVISION_ORDER.filter((d) => byDivision.has(d));
    const extras = [...byDivision.keys()].filter((d) => !COMPLIANCE_DIVISION_ORDER.includes(d as typeof COMPLIANCE_DIVISION_ORDER[number]));
    return [...ordered, ...extras].map((division) => ({ division, items: byDivision.get(division)! }));
  }, [compliances]);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [nextDueDate, setNextDueDate] = useState('');
  const [comments, setComments] = useState('');
  const { playConfirm } = useSound();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ id: genId(), name: name.trim(), completed: false, date, nextDueDate, comments });
    playConfirm();
    setName('');
    setDate('');
    setNextDueDate('');
    setComments('');
  };

  return (
    <div className="space-y-5">
      <Panel title="Add Compliance Item" icon={Plus} refCode="0201-C">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Compliance item name"
            className="md:col-span-2 rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          />
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-neutral-600">Last Completed</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-neutral-600">Next Due Date</label>
            <input
              type="date"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
              className="rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
            />
          </div>
          <input
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Comments..."
            className="rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
          />
          <button
            type="submit"
            className="md:col-span-5 flex items-center justify-center gap-2 rounded-md border border-invictus-crimson-bright/60 bg-invictus-crimson-bright/10 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-100 shadow-glow-subtle transition-all hover:bg-invictus-crimson-bright/20 hover:shadow-glow-strong"
          >
            <Plus className="h-4 w-4" /> Add Compliance Item
          </button>
        </form>
        {missingStandardCount > 0 && (
          <button
            onClick={onAddMissingStandard}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-neutral-400/30 bg-invictus-base/60 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-300 transition-colors hover:border-invictus-crimson-bright/40 hover:bg-invictus-crimson-bright/10 hover:text-invictus-crimson-bright"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Add {missingStandardCount} Missing Standard Item{missingStandardCount === 1 ? '' : 's'}
          </button>
        )}
      </Panel>

      <Panel title="Estate Compliance Tracker" icon={ShieldCheck} refCode="0200-C">
        <div className="mb-2 hidden gap-3 px-3 text-[10px] uppercase tracking-widest text-neutral-600 md:grid md:grid-cols-[auto_1.3fr_0.75fr_0.75fr_1.3fr_auto]">
          <span>Status</span>
          <span>Item</span>
          <span>Last Completed</span>
          <span>Next Due</span>
          <span>Comments</span>
          <span />
        </div>
        <div className="space-y-4">
          {compliances.length === 0 && (
            <p className="py-8 text-center text-xs text-neutral-600">No compliance items logged.</p>
          )}
          {divisionGroups.map(({ division, items }) => {
            const outstanding = items.filter((i) => !i.completed).length;
            return (
              <div key={division} className="space-y-2">
                <div className="flex items-center gap-2 pt-1">
                  <span className="rounded-full border border-invictus-crimson-bright/50 bg-invictus-crimson-bright/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-100">
                    {division}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-600">{items.length}</span>
                  {outstanding > 0 && (
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-400/80">{outstanding} due</span>
                  )}
                  <span className="h-px flex-1 bg-neutral-400/10" />
                </div>
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="relative grid grid-cols-1 items-center gap-3 rounded-md border border-neutral-400/20 bg-invictus-base/40 shadow-glow-subtle p-3 md:grid-cols-[auto_1.3fr_0.75fr_0.75fr_1.3fr_auto]"
                  >
                    <MicroCorners />
                    <button
                      onClick={() => {
                        if (!item.completed) playConfirm();
                        onToggle(item.id);
                      }}
                      className="flex items-center justify-center"
                      title={item.completed ? 'Mark incomplete' : 'Mark complete'}
                    >
                      {item.completed ? (
                        <CheckCircle2 className="h-6 w-6 text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.45)]" />
                      ) : (
                        <Circle className="h-6 w-6 text-neutral-600" />
                      )}
                    </button>

                    <p className={`text-sm ${item.completed ? 'text-emerald-200' : 'text-neutral-100'}`}>{item.name}</p>

                    <input
                      type="date"
                      value={item.date}
                      onChange={(e) => onChangeDate(item.id, e.target.value)}
                      className="rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-2 py-1.5 text-xs text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
                    />

                    <input
                      type="date"
                      value={item.nextDueDate}
                      onChange={(e) => onChangeNextDueDate(item.id, e.target.value)}
                      className="rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-2 py-1.5 text-xs text-neutral-100 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
                    />

                    <input
                      value={item.comments}
                      onChange={(e) => onChangeComments(item.id, e.target.value)}
                      placeholder="Comments..."
                      className="rounded-md border border-neutral-400/30 bg-invictus-base/60 focus:shadow-glow-strong px-2 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-600 focus:border-invictus-crimson-bright focus:outline-none focus:ring-1 focus:ring-invictus-crimson-bright/50"
                    />

                    <button
                      onClick={() => onDelete(item.id)}
                      className="flex items-center justify-center rounded-md border border-alert/30 bg-alert/10 p-1.5 text-alert transition-all hover:bg-alert/20 hover:shadow-glow-alert"
                      title="Delete compliance item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-md border border-amber-400/20 bg-amber-400/5 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <p className="text-xs text-amber-300/90">
            <span className="font-mono tabular-nums">{compliances.filter((c) => !c.completed).length}</span> compliance item(s) outstanding.
          </p>
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Boot splash — a 1s spinning-logo intro before the app loads in.
// ---------------------------------------------------------------------------

function BootSplash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5">
      <Pinwheel className="h-20 w-20 animate-spin text-invictus-crimson-bright drop-shadow-glow-subtle [animation-duration:1.1s]" />
      <p className="font-display text-sm uppercase tracking-[0.3em] text-invictus-crimson-bright/80 [text-shadow:var(--glow-text-subtle)]">
        {BRAND_NAME_DOTTED}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root page
// ---------------------------------------------------------------------------

export default function InvictusTrackerPage() {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [booting, setBooting] = useState(true);
  const [activePage, setActivePage] = useState<PageKey>('dashboard');
  // Everyone starts with a clean slate — no example tasks/events/compliances.
  // A signed-in user's own saved data loads from Firestore below and replaces
  // these, and anything they add persists to their account from then on.
  const [tasks, setTasks] = useState<Task[]>([]);
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [compliances, setCompliances] = useState<ComplianceItem[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'synced' | 'error'>('idle');
  const loadedForUid = useRef<string | null>(null);
  const readyToSave = useRef(false);

  // Render the app only after mount so live values (e.g. the diagnostics clock)
  // never differ between the server HTML and the first client render. Show a
  // brief spinning-logo splash, then load the app in after 1 second.
  useEffect(() => {
    setMounted(true);
    const timer = setTimeout(() => setBooting(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  // Load this user's saved progress from Firestore whenever they sign in.
  useEffect(() => {
    if (!user) {
      loadedForUid.current = null;
      readyToSave.current = false;
      setSyncStatus('idle');
      return;
    }
    if (loadedForUid.current === user.uid) return;
    loadedForUid.current = user.uid;
    readyToSave.current = false;
    setSyncStatus('loading');

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'jarvisState', user.uid));
        const data = snap.data();
        if (data) {
          if (Array.isArray(data.tasks)) setTasks(data.tasks as Task[]);
          if (Array.isArray(data.archivedTasks)) setArchivedTasks(data.archivedTasks as Task[]);
          if (Array.isArray(data.compliances)) setCompliances(data.compliances as ComplianceItem[]);
          if (Array.isArray(data.events)) setEvents(data.events as CalendarEvent[]);
        }
        setSyncStatus('synced');
      } catch (error) {
        console.error('Failed to load INVICTUS progress:', error);
        setSyncStatus('error');
      } finally {
        readyToSave.current = true;
      }
    })();
  }, [user]);

  // Persist tasks/compliances to Firestore whenever they change, while signed in.
  useEffect(() => {
    if (!user || !readyToSave.current) return;
    const timeout = setTimeout(() => {
      setDoc(doc(db, 'jarvisState', user.uid), {
        tasks,
        archivedTasks,
        compliances,
        events,
        updatedAt: Date.now(),
      })
        .then(() => setSyncStatus('synced'))
        .catch((error) => {
          console.error('Failed to save INVICTUS progress:', error);
          setSyncStatus('error');
        });
    }, 600);
    return () => clearTimeout(timeout);
  }, [tasks, archivedTasks, compliances, events, user]);

  const totalItems = tasks.length + compliances.length;
  const completedItems = tasks.filter((t) => t.status === 'Completed').length + compliances.filter((c) => c.completed).length;
  const completionPct = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);

  const handleAddTask = (task: Task) => setTasks((prev) => [...prev, task]);
  const handleUpdateStatus = (id: string, status: TaskStatus) =>
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status, completedAt: status === 'Completed' ? t.completedAt ?? Date.now() : undefined }
          : t
      )
    );
  const handleDeleteTask = (id: string) => setTasks((prev) => prev.filter((t) => t.id !== id));
  // A quick-add seed item is "missing" only if it's absent from BOTH the live list
  // and the archive — so an archived task is never resurrected by these buttons.
  const isTaskTracked = (prev: Task[], seedName: string) => {
    const key = seedName.trim().toLowerCase();
    return (
      prev.some((t) => t.name.trim().toLowerCase() === key) ||
      archivedTasks.some((t) => t.name.trim().toLowerCase() === key)
    );
  };
  const handleAddPendingReturnTasks = () => {
    setTasks((prev) => {
      const missing = PENDING_RETURN_TASKS.filter((p) => !isTaskTracked(prev, p.name));
      return [...prev, ...missing.map((item) => ({ ...item, id: genId() }))];
    });
  };
  const handleAddInboxTasks = () => {
    setTasks((prev) => {
      const missing = INBOX_TASKS.filter((i) => !isTaskTracked(prev, i.name));
      return [...prev, ...missing.map((item) => ({ ...item, id: genId() }))];
    });
  };
  const handleAddOutlookTasks = () => {
    setTasks((prev) => {
      const missing = OUTLOOK_TASKS.filter((o) => !isTaskTracked(prev, o.name));
      return [...prev, ...missing.map((item) => ({ ...item, id: genId() }))];
    });
  };

  const handleArchiveTask = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    setArchivedTasks((archived) => [...archived, { ...task, archivedAt: Date.now() }]);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };
  const handleArchiveAllCompleted = () => {
    const completed = tasks.filter((t) => t.status === 'Completed');
    if (completed.length === 0) return;
    const now = Date.now();
    setArchivedTasks((archived) => [...archived, ...completed.map((t) => ({ ...t, archivedAt: now }))]);
    setTasks((prev) => prev.filter((t) => t.status !== 'Completed'));
  };
  const handleRestoreTask = (id: string) => {
    const task = archivedTasks.find((t) => t.id === id);
    if (!task) return;
    const { archivedAt, ...rest } = task;
    setTasks((prev) => [...prev, rest]);
    setArchivedTasks((prev) => prev.filter((t) => t.id !== id));
  };
  const handleDeleteArchivedTask = (id: string) => setArchivedTasks((prev) => prev.filter((t) => t.id !== id));

  const handleAddCompliance = (item: ComplianceItem) => setCompliances((prev) => [...prev, item]);
  const handleToggleCompliance = (id: string) =>
    setCompliances((prev) => prev.map((c) => (c.id === id ? { ...c, completed: !c.completed } : c)));
  const handleChangeDate = (id: string, date: string) =>
    setCompliances((prev) => prev.map((c) => (c.id === id ? { ...c, date } : c)));
  const handleChangeNextDueDate = (id: string, nextDueDate: string) =>
    setCompliances((prev) => prev.map((c) => (c.id === id ? { ...c, nextDueDate } : c)));
  const handleChangeComments = (id: string, comments: string) =>
    setCompliances((prev) => prev.map((c) => (c.id === id ? { ...c, comments } : c)));
  const handleDeleteCompliance = (id: string) => setCompliances((prev) => prev.filter((c) => c.id !== id));
  const handleAddMissingStandardCompliances = () => {
    setCompliances((prev) => {
      const missing = SEED_COMPLIANCES.filter(
        (seed) => !prev.some((c) => c.name.trim().toLowerCase() === seed.name.trim().toLowerCase())
      );
      return [...prev, ...missing.map((item) => ({ ...item, id: genId() }))];
    });
  };

  const handleAddEvent = (event: CalendarEvent) => setEvents((prev) => [...prev, event]);
  const handleDeleteEvent = (id: string) => setEvents((prev) => prev.filter((e) => e.id !== id));
  const handleToggleMeeting = (id: string, date: string) =>
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        const completedDates = e.completedDates ?? [];
        return completedDates.includes(date)
          ? { ...e, completedDates: completedDates.filter((d) => d !== date) }
          : { ...e, completedDates: [...completedDates, date] };
      })
    );
  const handleImportEvents = (importEvents: CalendarEvent[]) => {
    const existingIds = new Set(events.map((e) => e.id));
    const toAdd = importEvents.filter((e) => !existingIds.has(e.id));
    if (toAdd.length > 0) setEvents((prev) => [...prev, ...toAdd]);
    return toAdd.length;
  };

  return (
    <div className="relative h-[calc(100vh-4rem)] w-full overflow-hidden bg-invictus-base font-sans text-neutral-100">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-neutral-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-neutral-500/10 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 z-40 animate-scanlines opacity-[0.07] mix-blend-screen"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, rgba(255,255,255,0.6) 0px, rgba(255,255,255,0.6) 1px, transparent 1px, transparent 8px)',
        }}
      />

      {mounted && booting && <BootSplash />}

      {mounted && !booting && (
        <div className="relative flex h-full">
          <Sidebar activePage={activePage} onNavigate={setActivePage} user={user} syncStatus={syncStatus} />
          <main className="flex-1 overflow-y-auto p-5">
            {activePage === 'dashboard' && (
              <Dashboard
                tasks={tasks}
                archivedTasks={archivedTasks}
                compliances={compliances}
                events={events}
                onToggleMeeting={handleToggleMeeting}
              />
            )}
            {activePage === 'calendar' && (
              <CalendarPage events={events} onAdd={handleAddEvent} onDelete={handleDeleteEvent} onImport={handleImportEvents} />
            )}
            {activePage === 'sitemap' && (
              <SiteMapPage tasks={tasks} onAddTask={handleAddTask} />
            )}
            {activePage === 'tasks' && (
              <TaskManager
                tasks={tasks}
                archivedTasks={archivedTasks}
                onAdd={handleAddTask}
                onUpdateStatus={handleUpdateStatus}
                onDelete={handleDeleteTask}
                onArchive={handleArchiveTask}
                onArchiveAllCompleted={handleArchiveAllCompleted}
                onAddPendingReturn={handleAddPendingReturnTasks}
                onAddInboxTasks={handleAddInboxTasks}
                onAddOutlookTasks={handleAddOutlookTasks}
              />
            )}
            {activePage === 'archive' && (
              <TaskArchive
                archivedTasks={archivedTasks}
                onRestore={handleRestoreTask}
                onDelete={handleDeleteArchivedTask}
              />
            )}
            {activePage === 'compliance' && (
              <ComplianceTracker
                compliances={compliances}
                onAdd={handleAddCompliance}
                onToggle={handleToggleCompliance}
                onChangeDate={handleChangeDate}
                onChangeNextDueDate={handleChangeNextDueDate}
                onChangeComments={handleChangeComments}
                onDelete={handleDeleteCompliance}
                onAddMissingStandard={handleAddMissingStandardCompliances}
              />
            )}
            {activePage === 'reports' && (
              <ReportsPage tasks={tasks} archivedTasks={archivedTasks} compliances={compliances} />
            )}
          </main>
        </div>
      )}
    </div>
  );
}
