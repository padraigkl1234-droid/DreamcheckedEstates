'use client';

// The app shell's navigation.
//
// From a tablet up it is a slim rail down the left edge: the brand mark, one
// icon per main page, a flyout each for the Events and Actions groups and for
// More, and the account cluster at the foot. Icons carry a tooltip, since an
// icon on its own is a guess until you've learnt it. When a group's page is
// open, that group's pages also run along the top as tabs, so moving between
// siblings doesn't mean going back through the flyout.
//
// A rail doesn't fit a phone, so phones keep a top bar with one Menu button
// that opens a full-screen sheet.
//
// The nav is all real links. Pages that live inside the tracker are tabs on
// /jarvis-tracker, which already syncs its active tab from ?page=, so they
// address exactly like the standalone routes do.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  BedDouble,
  ChevronDown,
  LogOut,
  MoreHorizontal,
  Settings as SettingsIcon,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Pinwheel } from '@/components/icons/Pinwheel';
import { InstallPwaButton } from '@/components/InstallPwaButton';
import { TeamSwitcher } from '@/components/TeamSwitcher';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { useSound } from '@/components/SoundProvider';
import { useT } from '@/components/LanguageProvider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getVisibleNavItems, NAV_GROUPS, type NavItem, type PageKey } from '@/components/AppSidebar';
import { isHotelTeam, profileName } from '@/lib/teams';

/** Tracker tabs address as ?page=<key>; everything else has its own route. */
export function navHref(item: NavItem): string {
  return item.route ?? `/jarvis-tracker?page=${item.key}`;
}

/** The pages that get an icon of their own on the rail, in order. Anything
 *  not named here (the two group parents aside) falls into More. */
const PRIMARY: PageKey[] = ['dashboard', 'calendar', 'tasks', 'sitemap', 'siteStatus', 'projectBoard', 'team'];
const MORE: PageKey[] = ['archive', 'reports', 'admin'];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

// ---- Rail pieces -----------------------------------------------------------

const railBtn = `relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors duration-[120ms] ease-out ${focusRing}`;
const railIdle = 'text-ink-dim hover:bg-ink/[0.06] hover:text-ink';
const railOn = 'bg-brand-tint text-ink';

/** The mark at the rail's edge beside whichever icon is the current page. */
function ActiveMark() {
  return <span aria-hidden className="absolute -left-[14px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-ink" />;
}

function RailTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="border-0 bg-ink px-2.5 py-1.5 text-xs font-bold text-white">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function RailLink({ href, label, icon: Icon, on }: { href: string; label: string; icon: LucideIcon; on: boolean }) {
  return (
    <RailTip label={label}>
      <Link href={href} aria-label={label} aria-current={on ? 'page' : undefined} className={`${railBtn} ${on ? railOn : railIdle}`}>
        {on && <ActiveMark />}
        <Icon className="h-5 w-5" strokeWidth={on ? 2.4 : 2} />
      </Link>
    </RailTip>
  );
}

function RailMenu({
  label,
  icon: Icon,
  on,
  children,
}: {
  label: string;
  icon: LucideIcon;
  on: boolean;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <RailTip label={label}>
        <DropdownMenuTrigger asChild>
          <button aria-label={label} className={`${railBtn} data-[state=open]:bg-ink/[0.06] data-[state=open]:text-ink ${on ? railOn : railIdle}`}>
            {on && <ActiveMark />}
            <Icon className="h-5 w-5" strokeWidth={on ? 2.4 : 2} />
          </button>
        </DropdownMenuTrigger>
      </RailTip>
      <DropdownMenuContent side="right" align="start" sideOffset={12} className="w-56">
        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</DropdownMenuLabel>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---- The shell ---------------------------------------------------------------

export function AppHeader() {
  const { user, logout } = useAuth();
  const { profile, team, isMaster } = useProfile();
  const { muted, toggleMute } = useSound();
  const t = useT();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const page = searchParams.get('page');

  const isAdmin = isMaster || profile?.rank === 'commander';
  const hotelTeam = isHotelTeam(team);

  // Everything this person can reach. The phone menu always offers the lot:
  // it is the only way around on a phone, and the hub's own bars only exist
  // on /hotel pages, so suppressing it stranded hotel-team users anywhere
  // else in the app.
  const allItems = getVisibleNavItems(isAdmin, team?.features, isMaster);
  // The rail does step aside on a hotel team, because the hub carries its own
  // navigation and the two would otherwise duplicate each other.
  const items = hotelTeam ? [] : allItems;

  const pick = (from: NavItem[], keys: PageKey[]) =>
    keys.map((k) => from.find((i) => i.key === k)).filter((i): i is NavItem => !!i);
  const byKey = (keys: PageKey[]) => pick(items, keys);

  // Which nav entry the current URL is on.
  const isCurrent = (item: NavItem) =>
    item.route ? pathname === item.route || pathname.startsWith(`${item.route}/`) : pathname === '/jarvis-tracker' && (page ?? 'dashboard') === item.key;

  const groups = NAV_GROUPS.map((g) => ({ ...g, items: byKey(g.items) })).filter((g) => g.items.length > 0);
  const primary = byKey(PRIMARY);
  const more = byKey(MORE);

  // The phone sheet's own lists, built from everything rather than the
  // rail's suppressed set.
  const mobilePrimary = pick(allItems, PRIMARY);
  const mobileGroups = NAV_GROUPS.map((g) => ({ ...g, items: pick(allItems, g.items) })).filter((g) => g.items.length > 0);
  const mobileMore = pick(allItems, MORE);
  // The group whose child is open — its items become the tabs along the top.
  const openGroup = groups.find((g) => g.items.some(isCurrent)) ?? null;
  const hasNav = allItems.length > 0 || hotelTeam;

  // Publish whether the tab bar is showing, so --chrome-h (and therefore
  // every page's height) accounts for its 50px.
  useEffect(() => {
    const el = document.documentElement;
    if (openGroup) el.setAttribute('data-subnav', '1');
    else el.removeAttribute('data-subnav');
    return () => el.removeAttribute('data-subnav');
  }, [openGroup]);

  const name = profileName(profile) !== 'Unknown' ? profileName(profile) : user?.displayName || user?.email || '';

  const [mobileMenu, setMobileMenu] = useState(false);
  // Close it on navigation, and let Escape out of it.
  useEffect(() => setMobileMenu(false), [pathname, page]);
  useEffect(() => {
    if (!mobileMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenu(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileMenu]);

  const menuItem = (item: NavItem) => (
    <DropdownMenuItem key={item.key} asChild>
      <Link href={navHref(item)} className={`cursor-pointer gap-2 font-semibold ${isCurrent(item) ? 'bg-accent' : ''}`}>
        <item.icon className="h-4 w-4" /> {item.label}
      </Link>
    </DropdownMenuItem>
  );

  const avatar = (size: string) => (
    <button
      className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-full bg-sun text-[12px] font-extrabold text-ink transition-opacity hover:opacity-90 ${focusRing}`}
      title={name}
      aria-label="Account menu"
    >
      {profile?.photoURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.photoURL} alt="" className="h-full w-full object-cover" />
      ) : (
        initialsOf(name)
      )}
    </button>
  );

  // The account menu is the same on the rail and on the phone bar; only where
  // it opens from differs.
  const accountMenu = (side: 'right' | 'bottom') => (
    <DropdownMenuContent side={side} align="end" sideOffset={side === 'right' ? 12 : 6} className="w-56">
      <DropdownMenuLabel className="flex flex-col">
        <span className="truncate">{profileName(profile)}</span>
        {team && <span className="truncate text-[10px] font-normal uppercase tracking-widest text-muted-foreground">{team.name}</span>}
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      {hotelTeam ? (
        <DropdownMenuItem asChild>
          <Link href="/hotel" className="cursor-pointer gap-2">Hotel hub</Link>
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem asChild>
          <Link href="/settings" className="cursor-pointer gap-2">
            <SettingsIcon className="h-4 w-4" /> {t('nav.settings')}
          </Link>
        </DropdownMenuItem>
      )}
      {isMaster && (
        <DropdownMenuItem asChild>
          <Link href="/master" className="cursor-pointer gap-2">{t('nav.masterConsole')}</Link>
        </DropdownMenuItem>
      )}
      <TeamSwitcher />
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => logout()} className="cursor-pointer gap-2 text-destructive focus:text-destructive">
        <LogOut className="h-4 w-4" /> {t('nav.signOut')}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  const sheetLink = (href: string, label: string, Icon: LucideIcon, on: boolean, key?: string) => (
    <Link
      key={key ?? href}
      href={href}
      onClick={() => setMobileMenu(false)}
      className={`flex items-center gap-3 rounded-xl px-4 py-3.5 text-base font-bold transition-colors ${
        on ? 'bg-brand text-white' : 'text-ink-muted hover:bg-ink/[0.06] hover:text-ink'
      }`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {label}
    </Link>
  );

  return (
    <>
      {/* ---- Tablet and desktop: the rail ---- */}
      <TooltipProvider delayDuration={250} skipDelayDuration={400}>
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-[var(--rail-w)] flex-col items-center border-r border-line bg-header-bg pb-4 pt-4 md:flex">
          <RailTip label={team?.name ? `Invictus · ${team.name}` : 'Invictus'}>
            <Link
              href={hotelTeam ? '/hotel' : '/jarvis-tracker'}
              aria-label="INVICTUS home"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-opacity hover:opacity-85 ${focusRing}`}
            >
              <Pinwheel className="h-[22px] w-[22px] animate-none" />
            </Link>
          </RailTip>

          {/* The middle scrolls if the window is too short to hold every
              icon; the brand and the account cluster stay put. The padding
              leaves room for the active mark, which sits outside its button. */}
          <nav className="mt-5 flex min-h-0 w-full flex-1 flex-col items-center gap-1.5 overflow-y-auto overflow-x-hidden px-[14px] py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {hotelTeam && <RailLink href="/hotel" label="Hotel hub" icon={BedDouble} on={pathname.startsWith('/hotel')} />}

            {primary.map((item) => (
              <RailLink key={item.key} href={navHref(item)} label={item.label} icon={item.icon} on={isCurrent(item)} />
            ))}

            {(groups.length > 0 || more.length > 0) && primary.length > 0 && (
              <span aria-hidden className="my-1.5 h-px w-6 shrink-0 bg-line" />
            )}

            {groups.map((group) => (
              <RailMenu key={group.key} label={t(group.labelKey)} icon={group.icon} on={group.items.some(isCurrent)}>
                {group.items.map(menuItem)}
              </RailMenu>
            ))}

            {more.length > 0 && (
              <RailMenu label="More" icon={MoreHorizontal} on={more.some(isCurrent)}>
                {more.map(menuItem)}
              </RailMenu>
            )}
          </nav>

          <div className="mt-3 flex shrink-0 flex-col items-center gap-1.5">
            <RailTip label="Online · saved">
              <span className="flex h-6 w-9 items-center justify-center" role="status" aria-label="Online, changes saved">
                <span className="h-2 w-2 rounded-full bg-ok" />
              </span>
            </RailTip>

            <InstallPwaButton compact />

            <RailTip label={muted ? 'Unmute interface sounds' : 'Mute interface sounds'}>
              <button
                onClick={toggleMute}
                aria-label={muted ? 'Unmute interface sounds' : 'Mute interface sounds'}
                className={`flex h-9 w-9 items-center justify-center rounded-lg text-ink-dim transition-colors hover:bg-ink/[0.06] hover:text-ink ${focusRing}`}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </RailTip>

            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>{avatar('mt-1.5 h-10 w-10')}</DropdownMenuTrigger>
                {accountMenu('right')}
              </DropdownMenu>
            )}
          </div>
        </aside>
      </TooltipProvider>

      {/* ---- Phones: a top bar with one menu ----
          The bar extends up through the status-bar inset, so an installed app
          doesn't show a strip of page above it. env() is 0 everywhere else. */}
      <header className="fixed left-0 right-0 top-0 z-40 border-b border-line bg-header-bg pt-[env(safe-area-inset-top)] md:hidden">
        <div className="flex h-16 items-center gap-3 px-4">
          <Link href={hotelTeam ? '/hotel' : '/jarvis-tracker'} className="flex shrink-0 items-center gap-2.5" title="INVICTUS">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white">
              <Pinwheel className="h-[18px] w-[18px] animate-none" />
            </span>
            <span className="text-[19px] font-extrabold tracking-tight text-ink">Invictus</span>
          </Link>

          {/* Everything on a phone lives behind one menu. It's a full-screen
              sheet rather than a dropdown: fifteen-odd items don't belong in
              a 240px popup, and rendering it ourselves means it can't be
              clipped or lost behind a portal's positioning. */}
          <div className="ml-auto flex items-center gap-2">
            {hasNav && (
              <button
                onClick={() => setMobileMenu(true)}
                className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-bold text-ink-muted transition-colors hover:bg-ink/[0.06] hover:text-ink ${focusRing}`}
                aria-expanded={mobileMenu}
                aria-haspopup="menu"
              >
                Menu <ChevronDown className="h-3.5 w-3.5" />
              </button>
            )}

            <InstallPwaButton />

            <button
              onClick={toggleMute}
              title={muted ? 'Unmute interface sounds' : 'Mute interface sounds'}
              className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-ink/[0.06] hover:text-ink"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>

            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>{avatar('h-8 w-8')}</DropdownMenuTrigger>
                {accountMenu('bottom')}
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      {/* The phone menu. */}
      {mobileMenu && hasNav && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-header-bg pt-[env(safe-area-inset-top)] md:hidden">
          <div className="flex h-16 shrink-0 items-center justify-between px-4">
            <span className="text-[19px] font-extrabold text-ink">Menu</span>
            <button
              onClick={() => setMobileMenu(false)}
              className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-ink/[0.06] hover:text-ink"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-4 pb-10">
            {hotelTeam && sheetLink('/hotel', 'Hotel hub', BedDouble, pathname.startsWith('/hotel'))}
            {mobilePrimary.map((item) => sheetLink(navHref(item), item.label, item.icon, isCurrent(item), item.key))}
            {mobileGroups.map((group) => (
              <div key={group.key} className="mt-4">
                <p className="px-4 pb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-header-dim">{t(group.labelKey)}</p>
                {group.items.map((item) => sheetLink(navHref(item), item.label, item.icon, isCurrent(item), item.key))}
              </div>
            ))}
            {mobileMore.length > 0 && (
              <div className="mt-4">
                <p className="px-4 pb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-header-dim">More</p>
                {mobileMore.map((item) => sheetLink(navHref(item), item.label, item.icon, isCurrent(item), item.key))}
              </div>
            )}
          </nav>
        </div>
      )}

      {/* Tabs for the open group: under the bar on a phone, along the top of
          the page beside the rail everywhere else. */}
      {openGroup && (
        <div className="fixed left-0 right-0 top-[calc(4rem+env(safe-area-inset-top))] z-30 h-[50px] border-b border-line bg-header-bg md:left-[var(--rail-w)] md:top-0">
          <nav className="flex h-[50px] items-center gap-0 overflow-x-auto px-8 max-md:px-4">
            <span className="mr-4 shrink-0 text-[11px] font-extrabold uppercase tracking-[0.12em] text-ink-placeholder max-md:hidden">
              {t(openGroup.labelKey)}
            </span>
            {openGroup.items.map((item) => {
              const on = isCurrent(item);
              return (
                <Link
                  key={item.key}
                  href={navHref(item)}
                  className={`flex h-[50px] items-center whitespace-nowrap border-b-[3px] px-3.5 text-sm font-bold transition-colors duration-[120ms] ${
                    on ? 'border-brand text-ink' : 'border-transparent text-ink-dim hover:text-ink'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}

/** True when the group tab bar is showing, so a page can offset for it. */
export function useHasSubNav(): boolean {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const page = searchParams.get('page');
  const { profile, team, isMaster } = useProfile();
  const isAdmin = isMaster || profile?.rank === 'commander';
  const items = getVisibleNavItems(isAdmin, team?.features, isMaster);
  return NAV_GROUPS.some((g) =>
    g.items
      .map((k) => items.find((i) => i.key === k))
      .filter((i): i is NavItem => !!i)
      .some((item) =>
        item.route ? pathname === item.route || pathname.startsWith(`${item.route}/`) : pathname === '/jarvis-tracker' && (page ?? 'dashboard') === item.key
      )
  );
}
