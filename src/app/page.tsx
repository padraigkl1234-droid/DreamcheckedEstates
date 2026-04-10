'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckSquare, ClipboardList, Clock, CheckCircle2 } from "lucide-react";
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip as RechartsTooltip 
} from 'recharts';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { motion } from 'motion/react';

export default function Home() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setAssignments([]);
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'assignments'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data());
      setAssignments(data);
      setLoading(false);
    }, (error) => {
      console.error("Home Page Firestore Error:", error);
      setLoading(false);
    });
    return unsubscribe;
  }, [user]);

  const chartData = useMemo(() => {
    const completed = assignments.filter(a => a.isArchived).length;
    const outstanding = assignments.filter(a => !a.isArchived).length;
    
    return [
      { name: 'Completed', value: completed, color: '#22c55e' }, // green-500
      { name: 'Outstanding', value: outstanding, color: '#94a3b8' }, // slate-400
    ];
  }, [assignments]);

  const completionPercentage = useMemo(() => {
    if (assignments.length === 0) return 0;
    const completed = assignments.filter(a => a.isArchived).length;
    return Math.round((completed / assignments.length) * 100);
  }, [assignments]);

  return (
    <div className="flex min-h-screen flex-col w-full">
      <main className="flex-grow flex flex-col items-center bg-background p-4 pt-12 sm:p-8 sm:pt-20">
        <div className="mb-12 flex flex-col items-center gap-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-3">
              <CheckSquare className="h-10 w-10 text-primary sm:h-12 sm:w-12" />
              <h1 className="relative font-headline text-4xl font-bold tracking-tight text-primary sm:text-5xl md:text-6xl">
                Dream Checked
                <span className="absolute -right-5 -top-3 rotate-12 rounded bg-destructive px-3 py-1 text-sm font-bold uppercase text-destructive-foreground shadow-sm sm:-right-8 sm:-top-5 sm:px-4 sm:py-1.5 sm:text-lg">
                  Estates
                </span>
              </h1>
            </div>
            <p className="max-w-md text-base text-muted-foreground sm:text-lg">
              Your central hub for Dreamland Estate Maintenance.
            </p>
          </div>

          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl px-4"
          >
            <p className="text-sm font-bold leading-relaxed text-muted-foreground/80">
              DreamChecked is the central hub for Dreamland Margate's estates and facilities management, streamlining operations and compliance to keep the site running smoothly in one place.
            </p>
          </motion.div>
        </div>

        <div className="w-full max-w-2xl">
          {/* Chart Section */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Card className="overflow-hidden border-primary/10 bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-2 text-center">
                <CardTitle className="text-xl font-bold uppercase tracking-widest text-muted-foreground">
                  Assignment Completion
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center pt-4">
                <div className="relative h-[300px] w-full">
                  {loading ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    </div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={80}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <RechartsTooltip 
                            contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-4xl font-bold text-primary">{completionPercentage}%</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Completed</span>
                      </div>
                    </>
                  )}
                </div>
                
                <div className="mt-6 grid w-full grid-cols-2 gap-4 border-t border-primary/5 pt-6">
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-2 text-green-500">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-2xl font-bold">{assignments.filter(a => a.isArchived).length}</span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Completed</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Clock className="h-4 w-4" />
                      <span className="text-2xl font-bold">{assignments.filter(a => !a.isArchived).length}</span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Outstanding</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </main>
      <footer className="w-full py-8 text-center text-sm text-muted-foreground border-t bg-muted/20">
          <p>Built for Dreamland Estate Management, created by Padraig Lyons</p>
      </footer>
    </div>
  );
}
