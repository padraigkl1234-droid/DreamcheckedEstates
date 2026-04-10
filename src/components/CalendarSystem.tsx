'use client';

import React, { useState } from 'react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  eachDayOfInterval 
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface CalendarEvent {
  date: Date;
  title: string;
  color?: string;
}

interface CalendarSystemProps {
  title?: string;
  events?: CalendarEvent[];
}

export function CalendarSystem({ title = "Calendar", events = [] }: CalendarSystemProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const getEventsForDay = (day: Date) => {
    return events.filter(event => isSameDay(event.date, day));
  };

  const selectedDayEvents = selectedDay ? getEventsForDay(selectedDay) : [];

  return (
    <div className="relative w-full">
      <Card className="w-full border-primary/20 shadow-lg shadow-primary/5 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3 px-4 bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary/10 rounded-md">
              <CalendarIcon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold leading-none">
                {format(currentMonth, 'MMMM yyyy')}
              </CardTitle>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">{title}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs px-2" onClick={() => setCurrentMonth(new Date())}>
              Today
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-b bg-muted/10">
            {weekDays.map((day) => (
              <div key={day} className="py-2 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 auto-rows-fr">
            {calendarDays.map((day, idx) => {
              const isCurrentMonth = isSameMonth(day, monthStart);
              const isToday = isSameDay(day, new Date());
              const dayEvents = getEventsForDay(day);
              
              return (
                <div
                  key={day.toString()}
                  onClick={() => setSelectedDay(day)}
                  className={cn(
                    "min-h-[60px] sm:min-h-[70px] p-1.5 border-r border-b transition-all cursor-pointer group relative",
                    !isCurrentMonth && "bg-muted/20 text-muted-foreground/30",
                    idx % 7 === 6 && "border-r-0",
                    "hover:bg-primary/5 hover:z-10"
                  )}
                >
                  <div className="flex justify-between items-start">
                    <span className={cn(
                      "text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full transition-colors",
                      isToday ? "bg-primary text-primary-foreground" : "group-hover:text-primary"
                    )}>
                      {format(day, 'd')}
                    </span>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.map((event, eventIdx) => (
                      <div 
                        key={eventIdx}
                        className={cn(
                          "text-[9px] leading-tight px-1 py-0.5 rounded border truncate",
                          event.color || "bg-primary/10 text-primary border-primary/20"
                        )}
                        title={event.title}
                      >
                        {event.title}
                      </div>
                    ))}
                  </div>
                  {/* Hover indicator */}
                  <div className="absolute inset-0 border-2 border-primary/0 group-hover:border-primary/20 pointer-events-none transition-colors" />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Enlarged Day View Overlay */}
      <AnimatePresence>
        {selectedDay && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
            onClick={() => setSelectedDay(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-md bg-card border border-primary/20 shadow-2xl rounded-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-muted/30 p-4 border-b flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-primary">
                    {format(selectedDay, 'EEEE, do MMMM')}
                  </h3>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{title}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedDay(null)} className="rounded-full">
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <div className="p-6 space-y-4">
                {selectedDayEvents.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Scheduled Tasks</p>
                    {selectedDayEvents.map((event, idx) => (
                      <div 
                        key={idx}
                        className={cn(
                          "flex items-center gap-4 p-4 rounded-lg border",
                          event.color || "bg-primary/5 border-primary/10 text-primary"
                        )}
                      >
                        <div className="p-2 bg-primary/10 rounded-full">
                          <ClipboardCheck className="h-5 w-5" />
                        </div>
                        <span className="text-lg font-medium">{event.title}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center space-y-2">
                    <div className="inline-flex p-3 bg-muted rounded-full">
                      <CalendarIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground font-medium">No tasks scheduled for this day.</p>
                  </div>
                )}
                <Button className="w-full mt-4" onClick={() => setSelectedDay(null)}>
                  Close
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
