'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu,
  CheckSquare,
  Wrench,
  LogOut,
  User as UserIcon,
  Bot
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';

const NAV_ITEMS = [
  { name: 'Estate Requests', href: '/estate-requests', icon: Wrench },
  { name: 'JARVIS', href: '/jarvis-tracker', icon: Bot },
];

export function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const isActive = (href: string) => pathname === href || (href === '/jarvis-tracker' && pathname === '/');

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
                  <CheckSquare className="h-6 w-6 text-primary" />
                  <span className="font-headline font-bold">Dream Checked</span>
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-2 py-6">
                {NAV_ITEMS.map((item) => (
                  <SheetClose asChild key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                        isActive(item.href) ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                      )}
                    >
                      <item.icon className={cn("h-5 w-5", isActive(item.href) ? "text-primary" : "")} />
                      {item.name}
                    </Link>
                  </SheetClose>
                ))}
              </nav>
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

          <Link href="/" className="flex items-center gap-2">
            <CheckSquare className="h-8 w-8 text-primary" />
            <span className="hidden font-headline text-xl font-bold tracking-tight sm:inline-block">
              Dream Checked
            </span>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                isActive(item.href) ? "bg-accent text-accent-foreground" : "text-muted-foreground"
              )}
            >
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <div className="hidden items-center gap-3 md:flex">
              <span className="text-xs text-muted-foreground">{user.displayName || user.email}</span>
              <Button variant="ghost" size="icon" onClick={() => logout()} title="Sign Out">
                <LogOut className="h-5 w-5 text-muted-foreground" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link href="/assignments">Sign In</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
