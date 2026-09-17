// Estates HUD — how the site map's zones are grouped for the at-a-glance
// status board (see /estates-hud). Purely a presentation grouping: every
// name here is a real SITE_ZONES label, which is also what a task's `area`
// holds, so a location's dot is driven by the same data the Site Map uses.
//
// Adding a finer-grained location (a specific toilet block, say) is a
// two-step job on purpose: add the zone to SITE_ZONES so tasks can actually
// be pinned to it, then list its label in the right section below. A zone
// that exists on the map but isn't listed here still shows up, under
// "Other" — nothing silently disappears from the board.

import { SITE_AREA_NAMES } from '@/lib/siteMapData';

export interface HudSection {
  name: string;
  /** SITE_ZONES labels, in the order they should read on the board. */
  locations: string[];
}

export const HUD_SECTIONS: HudSection[] = [
  {
    name: 'Toilets',
    locations: [
      'Food Court Toilets',
      'VIP Toilets',
      'Arcade Toilets',
      'Ballroom Toilets',
      'Concourse Toilets',
      'Shed Toilets',
      'Teddy & Betty / Ark Toilets',
      'Container Toilets',
    ],
  },
  {
    name: 'Food & Beverage',
    locations: [
      'Food Court',
      'Please Sir',
      'Kerb Bar',
      'Birdie Macs',
      'Beastie Baos',
      'Peppermint Bar',
      'Long Bar (Wheel)',
      'Long Bar (Waltzers)',
      'Bars storage',
    ],
  },
  {
    name: 'Venue Spaces',
    locations: ['Ballroom', 'Hall by the Sea', 'Cinema', 'Cinque Ports', 'Boardroom', 'Arcade', 'Concourse'],
  },
  {
    name: 'Rides & Attractions',
    locations: ['Rides', 'Roller Area', 'Scenic Railway', 'Scenic Stage', 'Teddy & Betty / Ark'],
  },
  {
    name: 'Access & Circulation',
    locations: ['Ingress', 'Transit Area', 'VIP'],
  },
  {
    name: 'Back of House',
    locations: ['Boneyard', 'Shed'],
  },
];

/**
 * The sections as rendered: every listed location that actually exists on the
 * map, plus an "Other" catch-all for map zones nobody has filed into a
 * section yet — so a zone added to SITE_ZONES shows up on the board whether
 * or not this file was updated alongside it.
 */
export function hudSections(): HudSection[] {
  const known = new Set(SITE_AREA_NAMES);
  const filed = new Set<string>();
  const sections = HUD_SECTIONS.map((s) => {
    const locations = s.locations.filter((l) => {
      if (!known.has(l)) return false; // listed here but no longer on the map
      filed.add(l);
      return true;
    });
    return { name: s.name, locations };
  }).filter((s) => s.locations.length > 0);

  const unfiled = SITE_AREA_NAMES.filter((l) => !filed.has(l));
  return unfiled.length ? [...sections, { name: 'Other', locations: unfiled }] : sections;
}
