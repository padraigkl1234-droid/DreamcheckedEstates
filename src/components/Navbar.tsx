'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu,
  Wrench,
  ClipboardCheck,
  ClipboardList,
  LogOut,
  User as UserIcon,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Pinwheel } from '@/components/icons/Pinwheel';
import { InstallPwaButton } from '@/components/InstallPwaButton';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet';
import { Users, Settings, Crown, Sun, Moon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { useTheme } from '@/components/ThemeProvider';
import { profileName, featureEnabled } from '@/lib/teams';
import { useSound } from '@/components/SoundProvider';

const NAV_ITEMS = [
  { name: 'Home', href: '/jarvis-tracker', icon: Pinwheel },
  { name: 'Estate Requests', href: '/estate-requests', icon: Wrench, feature: 'estateRequests' },
  { name: 'Checklists', href: '/checklists', icon: ClipboardCheck, feature: 'checklists' },
  { name: 'Audits', href: '/audits', icon: ClipboardList, feature: 'audits' },
];

export function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { profile, team, isMaster } = useProfile();
  const { resolved, setTheme } = useTheme();
  const { muted, toggleMute } = useSound();
  const isActive = (href: string) => pathname === href || (href === '/jarvis-tracker' && pathname === '/');
  // A feature-gated nav item shows only when this team has it enabled (the
  // master admin always sees everything).
  const navItems = NAV_ITEMS.filter(
    (item) => !item.feature || isMaster || featureEnabled(team?.features, item.feature)
  );

  return (
    <header className="fixed top-0 left-0 right-0 z-40 border-b bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-6 w-6" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] sm:w-[400px]">
              <SheetHeader className="border-b pb-4">
                <SheetTitle className="flex items-center gap-2">
                  <span className="font-headline text-lg font-bold uppercase tracking-[0.2em]">INVICTUS</span>
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-2 py-6">
                {navItems.map((item) => (
                  <SheetClose asChild key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium uppercase tracking-[0.15em] transition-colors hover:bg-accent hover:text-accent-foreground",
                        isActive(item.href) ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                      )}
                    >
                      <item.icon className={cn("h-5 w-5", isActive(item.href) ? "text-primary" : "")} />
                      {item.name}
                    </Link>
                  </SheetClose>
                ))}
              </nav>
              <div className="px-2">
                <InstallPwaButton />
              </div>
              {user && (
                <div className="absolute bottom-8 left-6 right-6 border-t pt-6">
                  <div className="mb-4 flex items-center gap-3 px-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <UserIcon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="truncate text-sm font-medium">{user.displayName || user.email}</span>
                      <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start gap-3 border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => logout()}
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </Button>
                </div>
              )}
            </SheetContent>
          </Sheet>

        </div>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium uppercase tracking-[0.15em] transition-colors hover:bg-accent hover:text-accent-foreground",
                isActive(item.href) ? "bg-accent text-accent-foreground" : "text-muted-foreground"
              )}
            >
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <InstallPwaButton />
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            title={muted ? 'Unmute interface sounds' : 'Mute interface sounds'}
            aria-pressed={muted}
          >
            {muted ? (
              <VolumeX className="h-5 w-5 text-muted-foreground" />
            ) : (
              <Volume2 className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="sr-only">{muted ? 'Unmute interface sounds' : 'Mute interface sounds'}</span>
          </Button>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full border border-border/60 py-1 pl-1 pr-2 transition-colors hover:border-primary/50" title="Account">
                  <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-primary/30 bg-primary/10">
                    {profile?.photoURL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.photoURL} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <UserIcon className="h-4 w-4 text-primary" />
                    )}
                  </span>
                  <span className="hidden max-w-[140px] truncate text-xs text-muted-foreground sm:inline">
                    {profileName(profile) !== 'Unknown' ? profileName(profile) : user.displayName || user.email}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col">
                  <span className="truncate">{profileName(profile)}</span>
                  {team && <span className="truncate text-[10px] font-normal uppercase tracking-widest text-muted-foreground">{team.name}</span>}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/team" className="cursor-pointer gap-2"><Users className="h-4 w-4" /> My Team</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="cursor-pointer gap-2"><Settings className="h-4 w-4" /> Settings</Link>
                </DropdownMenuItem>
                {isMaster && (
                  <DropdownMenuItem asChild>
                    <Link href="/master" className="cursor-pointer gap-2"><Crown className="h-4 w-4 text-amber-400" /> Master Console</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => { e.preventDefault(); setTheme(resolved === 'dark' ? 'light' : 'dark'); }}
                  className="cursor-pointer gap-2"
                >
                  {resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  {resolved === 'dark' ? 'Light mode' : 'Dark mode'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout()} className="cursor-pointer gap-2 text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="outline" size="sm" onClick={() => logout()}>
              Sign In
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
