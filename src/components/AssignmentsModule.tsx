'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, 
  ChevronDown, 
  ChevronUp, 
  Trash2, 
  Clock, 
  MapPin, 
  User, 
  AlertCircle,
  CheckCircle2,
  Circle,
  MoreHorizontal,
  Archive,
  LayoutDashboard,
  ClipboardList,
  LogIn,
  Paperclip,
  File,
  Image as ImageIcon,
  X,
  Loader2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';

// --- Constants ---

const TEAM_MEMBERS = ["Pàdraig Lyons", "Steven Bernard", "Cary Phillips"];

const LOCATIONS = [
  "Dreamland Park", "Scenic Stage", "HBTS", "Event Space", "Food Court", 
  "Scenic Railway", "Undercover", "Concourse", "Green Rooms", "Shed"
];

const PRIORITIES = {
  LOW: { label: "LOW", color: "bg-blue-500", text: "text-blue-500", border: "border-blue-200", bg: "bg-blue-50" },
  MED: { label: "MED", color: "bg-yellow-500", text: "text-yellow-500", border: "border-yellow-200", bg: "bg-yellow-50" },
  HIGH: { label: "HIGH", color: "bg-orange-500", text: "text-orange-500", border: "border-orange-200", bg: "bg-orange-50" },
  CRIT: { label: "CRIT", color: "bg-red-600", text: "text-red-600", border: "border-red-200", bg: "bg-red-50" }
};

const STATUSES = {
  "Not Started": { progress: 0, color: "bg-slate-400", dot: "bg-slate-400" },
  "In Progress": { progress: 20, color: "bg-blue-500", dot: "bg-blue-500" },
  "Awaiting Parts": { progress: 35, color: "bg-purple-500", dot: "bg-purple-500" },
  "On Hold": { progress: 50, color: "bg-amber-500", dot: "bg-amber-500" },
  "Completed": { progress: 100, color: "bg-green-500", dot: "bg-green-500" }
};

type PriorityKey = keyof typeof PRIORITIES;
type StatusKey = keyof typeof STATUSES;

interface Assignment {
  id: string;
  title: string;
  assignee: string;
  priority: PriorityKey;
  location: string;
  description: string;
  status: StatusKey;
  createdAt: number;
  isArchived: boolean;
  attachments?: { url: string; name: string; type: string }[];
  completionComment?: string;
  createdBy?: string;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

// --- Component ---

export default function AssignmentsModule() {
  const { user, loading: authLoading, login, authError } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newAssignee, setNewAssignee] = useState(TEAM_MEMBERS[0]);
  const [newPriority, setNewPriority] = useState<PriorityKey>('MED');
  const [newLocation, setNewLocation] = useState(LOCATIONS[0]);
  const [newDescription, setNewDescription] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // --- Firestore Sync ---

  useEffect(() => {
    if (!user) {
      setAssignments([]);
      setLoading(false);
      return;
    }

    const q = query(collection(db, 'assignments'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Assignment[];
      setAssignments(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'assignments');
    });

    return unsubscribe;
  }, [user]);

  const handleFirestoreError = (error: any, operationType: OperationType, path: string | null) => {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      operationType,
      path,
      authInfo: {
        userId: user?.uid,
        email: user?.email,
      }
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  };

  // --- Derived State ---

  const stats = useMemo(() => {
    const active = assignments.filter(a => !a.isArchived);
    return {
      totalActive: active.length,
      inProgress: active.filter(a => a.status === 'In Progress').length,
      critical: active.filter(a => a.priority === 'CRIT').length,
      completed: assignments.filter(a => a.isArchived).length
    };
  }, [assignments]);

  const filteredAssignments = useMemo(() => {
    return assignments
      .filter(a => activeTab === 'active' ? !a.isArchived : a.isArchived);
  }, [assignments, activeTab]);

  // --- Handlers ---

  const handleAddAssignment = async () => {
    if (!newTitle.trim() || !user) return;

    setIsUploading(true);
    const attachments = [];

    try {
      // Upload files first
      for (const file of selectedFiles) {
        const fileRef = ref(storage, `assignments/${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);
        attachments.push({
          url,
          name: file.name,
          type: file.type
        });
      }

      const assignmentData = {
        title: newTitle,
        assignee: newAssignee,
        priority: newPriority,
        location: newLocation,
        description: newDescription,
        status: 'Not Started',
        createdAt: Date.now(),
        isArchived: false,
        attachments,
        createdBy: user.uid
      };

      await addDoc(collection(db, 'assignments'), assignmentData);
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'assignments');
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setNewTitle('');
    setNewAssignee(TEAM_MEMBERS[0]);
    setNewPriority('MED');
    setNewLocation(LOCATIONS[0]);
    setNewDescription('');
    setSelectedFiles([]);
  };

  const updateStatus = async (id: string, status: StatusKey) => {
    try {
      await updateDoc(doc(db, 'assignments', id), { status });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `assignments/${id}`);
    }
  };

  const archiveAssignment = async (id: string, comment?: string) => {
    try {
      await updateDoc(doc(db, 'assignments', id), { 
        isArchived: true, 
        completionComment: comment || "" 
      });
      setExpandedId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `assignments/${id}`);
    }
  };

  const deleteAssignment = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'assignments', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `assignments/${id}`);
    }
  };

  // --- Render Helpers ---

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="mt-4 text-sm text-muted-foreground">Checking authentication...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-md rounded-2xl border-2 border-dashed p-12 text-center">
        <div className="mb-6 inline-flex rounded-full bg-primary/10 p-6">
          <LogIn className="h-10 w-10 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Sign In</h2>
        <p className="mt-2 text-muted-foreground">
          Please sign in with your team account to continue.
        </p>
        <Button onClick={login} size="lg" className="mt-8 w-full gap-2">
          <LogIn className="h-5 w-5" />
          Sign in with Google
        </Button>
        {authError && (
          <p className="mt-4 text-sm text-destructive">{authError}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[700px] space-y-6 pb-20">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total Active" value={stats.totalActive} icon={<LayoutDashboard className="h-4 w-4" />} color="text-primary" />
        <StatTile label="In Progress" value={stats.inProgress} icon={<Clock className="h-4 w-4" />} color="text-blue-500" />
        <StatTile label="Critical" value={stats.critical} icon={<AlertCircle className="h-4 w-4" />} color="text-red-600" />
        <StatTile label="Completed" value={stats.completed} icon={<CheckCircle2 className="h-4 w-4" />} color="text-green-600" />
      </div>

      {/* Header & Tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex rounded-lg bg-muted p-1">
          <button 
            onClick={() => setActiveTab('active')}
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-all",
              activeTab === 'active' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-primary"
            )}
          >
            Active
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px]">{assignments.filter(a => !a.isArchived).length}</span>
          </button>
          <button 
            onClick={() => setActiveTab('completed')}
            className={cn(
              "flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-all",
              activeTab === 'completed' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-primary"
            )}
          >
            Completed
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px]">{assignments.filter(a => a.isArchived).length}</span>
          </button>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Assignment
        </Button>
      </div>

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 w-full animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : filteredAssignments.length > 0 ? (
          filteredAssignments.map((assignment) => (
            <AssignmentCard 
              key={assignment.id}
              assignment={assignment}
              isExpanded={expandedId === assignment.id}
              onToggle={() => setExpandedId(expandedId === assignment.id ? null : assignment.id)}
              onStatusChange={(status) => updateStatus(assignment.id, status)}
              onArchive={(comment) => archiveAssignment(assignment.id, comment)}
              onDelete={() => deleteAssignment(assignment.id)}
              readOnly={activeTab === 'completed'}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-16 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <ClipboardList className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No assignments found</h3>
            <p className="text-sm text-muted-foreground">
              {activeTab === 'active' 
                ? "You're all caught up! Create a new assignment to get started." 
                : "No completed assignments yet."}
            </p>
          </div>
        )}
      </div>

      {activeTab === 'active' && filteredAssignments.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Sorted newest first · Click a card to expand · Use status dropdown to update progress
        </p>
      )}

      {/* New Assignment Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-lg bg-card border shadow-2xl rounded-2xl overflow-hidden"
            >
              <div className="bg-muted/30 p-6 border-b flex items-center justify-between">
                <h2 className="text-xl font-bold">New Assignment</h2>
                <Button variant="ghost" size="icon" onClick={() => setIsModalOpen(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Title</label>
                  <input 
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Fix broken fence in Food Court"
                    className="w-full rounded-lg border bg-background px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Assign To</label>
                    <select 
                      value={newAssignee}
                      onChange={(e) => setNewAssignee(e.target.value)}
                      className="w-full rounded-lg border bg-background px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {TEAM_MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Priority</label>
                    <select 
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value as PriorityKey)}
                      className="w-full rounded-lg border bg-background px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {Object.keys(PRIORITIES).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Location</label>
                  <select 
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    className="w-full rounded-lg border bg-background px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Description</label>
                  <textarea 
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Provide details about the task..."
                    rows={4}
                    className="w-full rounded-lg border bg-background px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Attachments</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-xs">
                        <File className="h-3 w-3" />
                        <span className="max-w-[100px] truncate">{file.name}</span>
                        <button onClick={() => setSelectedFiles(selectedFiles.filter((_, i) => i !== idx))}>
                          <X className="h-3 w-3 hover:text-destructive" />
                        </button>
                      </div>
                    ))}
                    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-primary/30 px-3 py-1.5 text-xs hover:bg-primary/5 transition-colors">
                      <Paperclip className="h-3 w-3" />
                      Add File
                      <input 
                        type="file" 
                        multiple 
                        className="hidden" 
                        onChange={(e) => {
                          if (e.target.files) {
                            setSelectedFiles([...selectedFiles, ...Array.from(e.target.files)]);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)} disabled={isUploading}>Cancel</Button>
                  <Button className="flex-1 gap-2" onClick={handleAddAssignment} disabled={isUploading}>
                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {isUploading ? "Uploading..." : "Create Assignment"}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatTile({ label, value, icon, color }: { label: string, value: number, icon: React.ReactNode, color: string }) {
  return (
    <Card className="overflow-hidden border-primary/10 bg-card/50 backdrop-blur-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
          <div className={cn("rounded-full bg-muted p-1.5", color)}>
            {icon}
          </div>
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function AssignmentCard({ 
  assignment, 
  isExpanded, 
  onToggle, 
  onStatusChange, 
  onArchive, 
  onDelete,
  readOnly 
}: { 
  assignment: Assignment, 
  isExpanded: boolean, 
  onToggle: () => void, 
  onStatusChange: (status: StatusKey) => void,
  onArchive: (comment?: string) => void,
  onDelete: () => void,
  readOnly: boolean
}) {
  const priority = PRIORITIES[assignment.priority];
  const status = STATUSES[assignment.status];
  const [comment, setComment] = useState('');

  return (
    <div className={cn(
      "group overflow-hidden rounded-xl border transition-all duration-300",
      isExpanded ? "border-primary/30 shadow-lg ring-1 ring-primary/10" : "border-primary/10 hover:border-primary/20 hover:bg-muted/30"
    )}>
      {/* Collapsed Header */}
      <div 
        onClick={onToggle}
        className="flex cursor-pointer items-center justify-between p-4"
      >
        <div className="flex flex-1 items-center gap-4 overflow-hidden">
          <div className={cn("flex h-8 w-12 items-center justify-center rounded-md text-[10px] font-bold", priority.bg, priority.text, "border", priority.border)}>
            {priority.label}
          </div>
          <div className="flex flex-col overflow-hidden">
            <h4 className="truncate font-semibold text-primary">{assignment.title}</h4>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {assignment.location}</span>
              <span className="flex items-center gap-1"><User className="h-3 w-3" /> {assignment.assignee}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div 
            onClick={(e) => e.stopPropagation()}
            className="relative"
          >
            {readOnly ? (
              <div className="flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-[10px] font-bold text-green-600 border border-green-100">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                COMPLETED
              </div>
            ) : (
              <select 
                value={assignment.status}
                onChange={(e) => onStatusChange(e.target.value as StatusKey)}
                className={cn(
                  "appearance-none rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider outline-none border transition-colors cursor-pointer pr-6",
                  assignment.status === 'Completed' ? "bg-green-50 text-green-600 border-green-200" : "bg-muted text-muted-foreground border-muted-foreground/20"
                )}
              >
                {Object.keys(STATUSES).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {!readOnly && <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 opacity-50" />}
          </div>
          {isExpanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1 w-full bg-muted overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${status.progress}%` }}
          className={cn("h-full transition-all duration-500", status.color)}
        />
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-muted/20"
          >
            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Full Description</p>
                <p className="text-sm leading-relaxed text-muted-foreground/90">{assignment.description || "No description provided."}</p>
              </div>

              {assignment.attachments && assignment.attachments.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Attachments ({assignment.attachments.length})</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {assignment.attachments.map((file, idx) => (
                      <a 
                        key={idx} 
                        href={file.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-lg border bg-background p-3 transition-colors hover:border-primary/30 hover:bg-primary/5"
                      >
                        <div className="rounded-md bg-primary/10 p-2">
                          {file.type.startsWith('image/') ? <ImageIcon className="h-4 w-4 text-primary" /> : <File className="h-4 w-4 text-primary" />}
                        </div>
                        <div className="flex flex-col overflow-hidden">
                          <span className="truncate text-xs font-medium">{file.name}</span>
                          <span className="text-[10px] text-muted-foreground uppercase">{file.type.split('/')[1] || 'file'}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {assignment.completionComment && (
                <div className="space-y-2 rounded-lg bg-green-50/50 p-4 border border-green-100">
                  <p className="text-xs font-bold uppercase tracking-widest text-green-700">Completion Comment</p>
                  <p className="text-sm leading-relaxed text-green-800 italic">"{assignment.completionComment}"</p>
                </div>
              )}

              <div className="flex flex-wrap gap-4 pt-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Created</span>
                  <div className="flex items-center gap-2 rounded-md bg-background border px-3 py-1.5 text-xs font-medium">
                    <Clock className="h-3 w-3 text-primary" />
                    {new Date(assignment.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Location</span>
                  <div className="flex items-center gap-2 rounded-md bg-background border px-3 py-1.5 text-xs font-medium">
                    <MapPin className="h-3 w-3 text-primary" />
                    {assignment.location}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Assignee</span>
                  <div className="flex items-center gap-2 rounded-md bg-background border px-3 py-1.5 text-xs font-medium">
                    <User className="h-3 w-3 text-primary" />
                    {assignment.assignee}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4 pt-4 border-t border-primary/5">
                {!readOnly && assignment.status === 'Completed' && (
                  <div className="space-y-3 w-full">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Completion Comment (Optional)</label>
                      <textarea 
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Explain how the task was completed..."
                        rows={2}
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                      />
                    </div>
                    <Button 
                      onClick={() => onArchive(comment)}
                      className="w-full bg-green-600 hover:bg-green-700 gap-2"
                    >
                      <Archive className="h-4 w-4" />
                      Archive as Complete
                    </Button>
                  </div>
                )}
                
                <div className="flex items-center justify-between w-full">
                  <div />
                  <Button 
                    onClick={() => onDelete(assignment.id)}
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Assignment
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function X({ className, ...props }: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function ClipboardList({ className, ...props }: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </svg>
  );
}

function Gauge({ className, ...props }: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m12 14 4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  );
}

function FileSpreadsheet({ className, ...props }: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M8 13h2" />
      <path d="M14 13h2" />
      <path d="M8 17h2" />
      <path d="M14 17h2" />
    </svg>
  );
}
