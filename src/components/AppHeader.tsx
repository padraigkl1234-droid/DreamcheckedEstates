'use client';

// The app shell's top bar, which replaces both the old left sidebar and the
// old Dreamland navbar (see design_handoff_invictus_redesign).
//
// A 64px navy bar: brand, the primary nav, and the online/avatar cluster on
// the right. Parents with children (Events, Actions, More) open a menu, and
// when one of their children is the current page a second white bar appears
// underneath with that group's items.
//
// The nav is all real links. Pages that live inside the tracker are tabs on
// /jarvis-tracker, which already syncs its active tab from ?page=, so they
// address exactly like the standalone routes do.

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown, LogOut, Moon, Settings as SettingsIcon, Sun, Volume2, VolumeX } from 'lucide-react';
import { Pinwheel } from '@/components/icons/Pinwheel';
import { InstallPwaButton } from '@/components/InstallPwaButton';
import { TeamSwitcher } from '@/components/TeamSwitcher';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { useTheme } from '@/components/ThemeProvider';
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
import { getVisibleNavItems, NAV_GROUPS, type NavItem, type PageKey } from '@/components/AppSidebar';
import { isHotelTeam, profileName } from '@/lib/teams';

/** Tracker tabs address as ?page=<key>; everything else has its own route. */
export function navHref(item: NavItem): string {
  return item.route ?? `/jarvis-tracker?page=${item.key}`;
}

/** Top-level order from the design. Anything not named here (the two group
 *  parents aside) falls into More. */
const PRIMARY: PageKey[] = ['dashboard', 'calendar', 'tasks', 'sitemap', 'siteStatus', 'projectBoard', 'team'];
const MORE: PageKey[] = ['archive', 'reports', 'admin'];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const linkBase =
  'rounded-lg px-3 py-2 text-sm font-bold transition-colors duration-[120ms] ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';
const linkIdle = 'text-header-text hover:bg-white/[0.06] hover:text-white';
const linkActive = 'bg-brand px-3.5 text-white';

export function AppHeader() {
  const { user, logout } = useAuth();
  const { profile, team, isMaster } = useProfile();
  const { resolved, setTheme } = useTheme();
  const { muted, toggleMute } = useSound();
  const t = useT();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const page = searchParams.get('page');

  const isAdmin = isMaster || profile?.rank === 'commander';
  // A hotel team's navigation lives in the hub's own bar (HotelShell), so the
  // header carries only the brand and the account menu for them — one shell,
  // not two competing sets of links.
  const items = isHotelTeam(team) ? [] : getVisibleNavItems(isAdmin, team?.features, isMaster);
  const byKey = (keys: PageKey[]) => keys.map((k) => items.find((i) => i.key === k)).filter((i): i is NavItem => !!i);

  // Which nav entry the current URL is on.
  const isCurrent = (item: NavItem) =>
    item.route ? pathname === item.route || pathname.startsWith(`${item.route}/`) : pathname === '/jarvis-tracker' && (page ?? 'dashboard') === item.key;

  const groups = NAV_GROUPS.map((g) => ({ ...g, items: byKey(g.items) })).filter((g) => g.items.length > 0);
  const primary = byKey(PRIMARY);
  const more = byKey(MORE);
  // The group whose child is open — its items become the sub-nav bar.
  const openGroup = groups.find((g) => g.items.some(isCurrent)) ?? null;

  // Under ~1200px the design folds everything after Task Manager into More.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1200px)');
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  const cutoff = narrow ? 3 : primary.length;
  const shownPrimary = primary.slice(0, cutoff);
  const overflow = [...primary.slice(cutoff), ...more];

  // Publish whether the sub-nav is showing, so --chrome-h (and therefore
  // every page's height) accounts for its 50px.
  useEffect(() => {
    const el = document.documentElement;
    if (openGroup) el.setAttribute('data-subnav', '1');
    else el.removeAttribute('data-subnav');
    return () => el.removeAttribute('data-subnav');
  }, [openGroup]);

  const name = profileName(profile) !== 'Unknown' ? profileName(profile) : user?.displayName || user?.email || '';

  // Keep the nav scrolled to whatever is active on a narrow screen.
  const railRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-40 h-16 bg-header-bg">
        <div className="flex h-16 items-center gap-7 px-8 max-md:gap-3 max-md:px-4">
          {/* Brand */}
          <Link href="/jarvis-tracker" className="flex shrink-0 items-center gap-2.5" title="INVICTUS">
            <Pinwheel className="h-[26px] w-[26px] animate-none text-white" />
            <span className="text-[19px] font-extrabold tracking-tight text-white">Invictus</span>
            {team?.name && (
              <span className="ml-2 border-l border-header-divider pl-3 text-[11px] font-bold uppercase tracking-[0.14em] text-header-dim max-lg:hidden">
                {team.name}
              </span>
            )}
          </Link>

          {/* Primary nav */}
          <nav ref={railRef} className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto max-md:hidden">
            {shownPrimary.map((item) => (
              <Link key={item.key} href={navHref(item)} className={`${linkBase} whitespace-nowrap ${isCurrent(item) ? linkActive : linkIdle}`}>
                {item.label}
              </Link>
            ))}

            {!narrow &&
              groups.map((group) => {
                const on = group.items.some(isCurrent);
                return (
                  <DropdownMenu key={group.key}>
                    <DropdownMenuTrigger asChild>
                      <button className={`${linkBase} flex items-center gap-1 whitespace-nowrap ${on ? linkActive : linkIdle}`}>
                        {t(group.labelKey)} <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      {group.items.map((item) => (
                        <DropdownMenuItem key={item.key} asChild>
                          <Link href={navHref(item)} className="cursor-pointer gap-2 font-semibold">
                            <item.icon className="h-4 w-4" /> {item.label}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              })}

            {(overflow.length > 0 || narrow) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={`${linkBase} flex items-center gap-1 whitespace-nowrap ${linkIdle}`}>
                    More <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {narrow &&
                    groups.map((group) => (
                      <React.Fragment key={group.key}>
                        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          {t(group.labelKey)}
                        </DropdownMenuLabel>
                        {group.items.map((item) => (
                          <DropdownMenuItem key={item.key} asChild>
                            <Link href={navHref(item)} className="cursor-pointer gap-2 font-semibold">
                              <item.icon className="h-4 w-4" /> {item.label}
                            </Link>
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                      </React.Fragment>
                    ))}
                  {overflow.map((item) => (
                    <DropdownMenuItem key={item.key} asChild>
                      <Link href={navHref(item)} className="cursor-pointer gap-2 font-semibold">
                        <item.icon className="h-4 w-4" /> {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </nav>

          {/* Everything on a phone lives behind one menu. */}
          <div className="ml-auto flex items-center gap-3 md:ml-0 md:gap-3">
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={`${linkBase} flex items-center gap-1 ${linkIdle}`}>
                    Menu <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-60">
                  {primary.map((item) => (
                    <DropdownMenuItem key={item.key} asChild>
                      <Link href={navHref(item)} className="cursor-pointer gap-2 font-semibold">
                        <item.icon className="h-4 w-4" /> {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                  {groups.map((group) => (
                    <React.Fragment key={group.key}>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {t(group.labelKey)}
                      </DropdownMenuLabel>
                      {group.items.map((item) => (
                        <DropdownMenuItem key={item.key} asChild>
                          <Link href={navHref(item)} className="cursor-pointer gap-2 font-semibold">
                            <item.icon className="h-4 w-4" /> {item.label}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </React.Fragment>
                  ))}
                  {more.length > 0 && <DropdownMenuSeparator />}
                  {more.map((item) => (
                    <DropdownMenuItem key={item.key} asChild>
                      <Link href={navHref(item)} className="cursor-pointer gap-2 font-semibold">
                        <item.icon className="h-4 w-4" /> {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <span className="flex items-center gap-2 text-[13px] font-semibold text-header-text max-lg:hidden">
              <span className="h-2 w-2 rounded-full bg-ok" />
              Online · saved
            </span>

            <InstallPwaButton />

            <button
              onClick={toggleMute}
              title={muted ? 'Unmute interface sounds' : 'Mute interface sounds'}
              className="rounded-lg p-2 text-header-text transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>

            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sun text-[12px] font-extrabold text-header-bg transition-opacity hover:opacity-90"
                    title={name}
                  >
                    {profile?.photoURL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.photoURL} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initialsOf(name)
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="flex flex-col">
                    <span className="truncate">{profileName(profile)}</span>
                    {team && (
                      <span className="truncate text-[10px] font-normal uppercase tracking-widest text-muted-foreground">{team.name}</span>
                    )}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {isHotelTeam(team) ? (
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
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      setTheme(resolved === 'dark' ? 'light' : 'dark');
                    }}
                    className="cursor-pointer gap-2"
                  >
                    {resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    {resolved === 'dark' ? t('nav.lightMode') : t('nav.darkMode')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => logout()} className="cursor-pointer gap-2 text-destructive focus:text-destructive">
                    <LogOut className="h-4 w-4" /> {t('nav.signOut')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      {/* Sub-navigation for the open group. */}
      {openGroup && (
        <div className="fixed left-0 right-0 top-16 z-30 h-[50px] border-b border-line bg-white">
          <nav className="flex h-[50px] items-center gap-0 overflow-x-auto px-8 max-md:px-4">
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

/** True when the sub-nav bar is showing, so a page can offset for it. */
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
