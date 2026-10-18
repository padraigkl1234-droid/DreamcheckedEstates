'use client';

// The dashboard's private to-do list. Reads and writes a single field on the
// signed-in user's own profile document, so it needs no new collection and no
// rules change.

import React, { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Check, Plus, Trash2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import {
  MAX_TODOS,
  MAX_TODO_LENGTH,
  addTodo,
  clearDone,
  countOpen,
  editTodo,
  forStorage,
  parseTodos,
  removeTodo,
  sortTodos,
  toggleTodo,
  type PersonalTodo,
} from '@/lib/personalTodos';

export function PersonalTodoCard() {
  const { user } = useAuth();
  const [todos, setTodos] = useState<PersonalTodo[]>([]);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // What we last sent. A write echoes back through the listener, and without
  // this the echo would overwrite a change made in the meantime — most
  // visibly by resurrecting the text of an item being typed into.
  const pending = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      setTodos([]);
      return;
    }
    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        const next = parseTodos(snap.data()?.todos);
        const key = JSON.stringify(forStorage(next));
        if (pending.current !== null && pending.current !== key) return;
        pending.current = null;
        setTodos(next);
      },
      (err) => {
        console.error('Could not read your to-do list:', err);
        setError('Could not load your list.');
      }
    );
    return unsub;
  }, [user]);

  const save = async (next: PersonalTodo[]) => {
    if (!user) return;
    setTodos(next); // optimistic: the list must feel instant
    const payload = forStorage(next);
    pending.current = JSON.stringify(payload);
    setError(null);
    try {
      await setDoc(doc(db, 'users', user.uid), { todos: payload }, { merge: true });
    } catch (err) {
      console.error('Could not save your to-do list:', err);
      setError('That did not save — check your connection.');
      pending.current = null;
    }
  };

  const submitDraft = () => {
    const next = addTodo(todos, draft);
    if (!next) {
      if (draft.trim() && todos.length >= MAX_TODOS) setError(`That's the lot — ${MAX_TODOS} items is the limit.`);
      return;
    }
    setDraft('');
    void save(next);
  };

  const commitEdit = () => {
    if (!editingId) return;
    const id = editingId;
    setEditingId(null);
    const next = editTodo(todos, id, editText);
    // Don't write when nothing actually changed.
    if (JSON.stringify(forStorage(next)) !== JSON.stringify(forStorage(todos))) void save(next);
  };

  const shown = sortTodos(todos);
  const open = countOpen(todos);
  const doneCount = todos.length - open;

  if (!user) return null;

  return (
    <div className="flex h-full flex-col rounded-2xl bg-white px-[26px] py-[22px] max-md:px-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[19px] font-extrabold text-ink">My to-do list</h2>
        <div className="flex shrink-0 items-center gap-2">
          {doneCount > 0 && (
            <button
              onClick={() => void save(clearDone(todos))}
              className="text-[13px] font-bold text-ink-dim transition-colors hover:text-ink"
            >
              Clear done
            </button>
          )}
          <span className="rounded-full bg-brand-tint px-3 py-[5px] text-xs font-bold text-brand">
            {open} open
          </span>
        </div>
      </div>

      <p className="mb-3 text-[13px] font-semibold text-ink-dim">
        Just for you — these aren&apos;t team tasks.
      </p>

      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submitDraft();
            }
          }}
          maxLength={MAX_TODO_LENGTH}
          placeholder="Something to remember…"
          aria-label="Add a to-do"
          className="min-w-0 flex-1 rounded-[10px] border border-line bg-white px-3.5 py-2.5 text-[15px] font-semibold text-ink outline-none transition-colors placeholder:font-medium placeholder:text-ink-placeholder focus:border-brand"
        />
        <button
          onClick={submitDraft}
          disabled={!draft.trim()}
          className="flex shrink-0 items-center gap-1.5 rounded-[10px] bg-brand px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-brand-hover disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      {error && <p className="mt-2 text-[13px] font-semibold text-danger">{error}</p>}

      {shown.length === 0 ? (
        <p className="py-7 text-center text-sm font-semibold text-ink-dim">
          Nothing on your list. Add the first thing above.
        </p>
      ) : (
        <div className="-mx-[26px] -mb-[22px] mt-1 max-md:-mx-4">
          {shown.map((t, i) => (
            <div
              key={t.id}
              className={`group/todo flex items-center gap-3 px-[26px] py-[14px] max-md:px-4 ${
                i > 0 ? 'border-t border-line-row' : ''
              }`}
            >
              <button
                onClick={() => void save(toggleTodo(todos, t.id))}
                aria-label={t.done ? `Mark "${t.text}" as not done` : `Mark "${t.text}" as done`}
                aria-pressed={t.done}
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors ${
                  t.done ? 'border-brand bg-brand text-white' : 'border-line-check hover:border-brand'
                }`}
              >
                {t.done && <Check className="h-3 w-3" strokeWidth={3.5} />}
              </button>

              {editingId === t.id ? (
                <input
                  autoFocus
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitEdit();
                    } else if (e.key === 'Escape') {
                      setEditingId(null);
                    }
                  }}
                  maxLength={MAX_TODO_LENGTH}
                  aria-label="Edit this to-do"
                  className="min-w-0 flex-1 rounded-md border border-brand bg-white px-2 py-1 text-[15px] font-bold text-ink outline-none"
                />
              ) : (
                <button
                  onClick={() => {
                    setEditingId(t.id);
                    setEditText(t.text);
                  }}
                  title="Click to edit"
                  className={`min-w-0 flex-1 break-words text-left text-[15px] font-bold transition-colors ${
                    t.done ? 'text-ink-dim line-through' : 'text-ink'
                  }`}
                >
                  {t.text}
                </button>
              )}

              <button
                onClick={() => void save(removeTodo(todos, t.id))}
                title="Delete"
                aria-label={`Delete "${t.text}"`}
                className="shrink-0 rounded-md p-1.5 text-ink-placeholder opacity-0 transition-opacity hover:bg-danger-tint hover:text-danger focus:opacity-100 group-hover/todo:opacity-100 max-md:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
