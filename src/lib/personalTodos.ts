// A private jotter: the handful of things you need to remember that aren't
// worth raising as a team task.
//
// These live on your own user document rather than in a collection of their
// own, because the rules already let you write that document and nobody has
// to republish anything for this to work. The trade is that a list kept there
// is as readable as the rest of your profile — fine for "order drain covers",
// not the place for anything you'd mind a teammate seeing.

export type PersonalTodo = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  /** When it was last ticked, so "clear done" can tidy the oldest first. */
  doneAt?: number;
};

/** Plenty for a reminder list, and keeps the profile document small. */
export const MAX_TODOS = 60;
export const MAX_TODO_LENGTH = 200;

export function newTodoId(): string {
  return `td-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Read whatever is on the profile document back as a list.
 *
 * Anything stored there has been through a round trip and may predate this
 * code, so every field is checked rather than trusted: one malformed entry
 * shouldn't take the whole list down with it.
 */
export function parseTodos(raw: unknown): PersonalTodo[] {
  if (!Array.isArray(raw)) return [];
  const out: PersonalTodo[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const t = item as Record<string, unknown>;
    const text = typeof t.text === 'string' ? t.text.trim() : '';
    if (!text) continue;
    out.push({
      id: typeof t.id === 'string' && t.id ? t.id : newTodoId(),
      text: text.slice(0, MAX_TODO_LENGTH),
      done: t.done === true,
      createdAt: typeof t.createdAt === 'number' ? t.createdAt : 0,
      ...(typeof t.doneAt === 'number' ? { doneAt: t.doneAt } : {}),
    });
  }
  return out;
}

/** Strip undefined before a write — Firestore rejects it inside an array. */
export function forStorage(todos: PersonalTodo[]): Record<string, unknown>[] {
  return todos.map((t) => ({
    id: t.id,
    text: t.text,
    done: t.done,
    createdAt: t.createdAt,
    ...(t.doneAt === undefined ? {} : { doneAt: t.doneAt }),
  }));
}

/** Outstanding first, each group newest first. Ticking something sends it
 *  down out of the way without deleting it. */
export function sortTodos(todos: PersonalTodo[]): PersonalTodo[] {
  return [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return b.createdAt - a.createdAt;
  });
}

/** Returns the new list, or null when there's nothing to add or no room. */
export function addTodo(todos: PersonalTodo[], text: string): PersonalTodo[] | null {
  const clean = text.trim().slice(0, MAX_TODO_LENGTH);
  if (!clean) return null;
  if (todos.length >= MAX_TODOS) return null;
  return [{ id: newTodoId(), text: clean, done: false, createdAt: Date.now() }, ...todos];
}

export function toggleTodo(todos: PersonalTodo[], id: string): PersonalTodo[] {
  return todos.map((t) =>
    t.id === id ? { ...t, done: !t.done, ...(t.done ? {} : { doneAt: Date.now() }) } : t
  );
}

export function editTodo(todos: PersonalTodo[], id: string, text: string): PersonalTodo[] {
  const clean = text.trim().slice(0, MAX_TODO_LENGTH);
  // An empty edit means "delete" — it's what the keyboard does naturally.
  if (!clean) return todos.filter((t) => t.id !== id);
  return todos.map((t) => (t.id === id ? { ...t, text: clean } : t));
}

export function removeTodo(todos: PersonalTodo[], id: string): PersonalTodo[] {
  return todos.filter((t) => t.id !== id);
}

export function clearDone(todos: PersonalTodo[]): PersonalTodo[] {
  return todos.filter((t) => !t.done);
}

export function countOpen(todos: PersonalTodo[]): number {
  return todos.reduce((n, t) => (t.done ? n : n + 1), 0);
}
