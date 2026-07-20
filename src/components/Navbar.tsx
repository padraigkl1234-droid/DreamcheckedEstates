'use client';

import React from 'react';
import Link from 'next/link';
import {
  LogOut,
  User as UserIcon,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { InstallPwaButton } from '@/components/InstallPwaButton';
import { Button } from '@/components/ui/button';
import { Users, Settings, Crown, Sun, Moon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/components/AuthProvider';
import { useProfile } from '@/components/ProfileProvider';
import { useTheme } from '@/components/ThemeProvider';
import { useT } from '@/components/LanguageProvider';
import { profileName } from '@/lib/teams';
import { useSound } from '@/components/SoundProvider';

export function Navbar() {
  const { user, logout } = useAuth();
  const { profile, team, isMaster } = useProfile();
  const { resolved, setTheme } = useTheme();
  const t = useT();
  const { muted, toggleMute } = useSound();

  return (
    <header className="fixed top-0 left-0 right-0 z-40 border-b bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-end px-4">
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
                  <Link href="/team" className="cursor-pointer gap-2"><Users className="h-4 w-4" /> {t('nav.myTeam')}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="cursor-pointer gap-2"><Settings className="h-4 w-4" /> {t('nav.settings')}</Link>
                </DropdownMenuItem>
                {isMaster && (
                  <DropdownMenuItem asChild>
                    <Link href="/master" className="cursor-pointer gap-2"><Crown className="h-4 w-4 text-amber-400" /> {t('nav.masterConsole')}</Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => { e.preventDefault(); setTheme(resolved === 'dark' ? 'light' : 'dark'); }}
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
