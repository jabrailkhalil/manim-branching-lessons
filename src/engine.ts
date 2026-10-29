export type Choice = { id: string; label: string; target: string };
type Clip = { id: string; title: string; video: string; transcript: string };
export type LessonNode = Clip &
  (
    | { kind: "question"; prompt: string; choices: Choice[] }
    | { kind: "explanation"; next: string }
    | { kind: "complete" }
  );
export type Lesson = {
  version: 1;
  id: string;
  title: string;
  start: string;
  nodes: LessonNode[];
};
export type Action = { from: string; choice?: string };
export type Attempt = { current: string; events: Action[] };
export const MAX_EVENTS = 200;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected an object");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 10000)
    throw new Error("Expected nonempty text of at most 10000 characters");
  return value;
}
export function parseLesson(value: unknown): Lesson {
  const root = record(value);
  if (root.version !== 1) throw new Error("Unsupported lesson version");
  if (
    !Array.isArray(root.nodes) ||
    !root.nodes.length ||
    root.nodes.length > 100
  )
    throw new Error("Expected 1–100 nodes");
  const nodes: LessonNode[] = root.nodes.map((raw) => {
    const n = record(raw);
    const clip: Clip = {
      id: text(n.id),
      title: text(n.title),
      video: text(n.video),
      transcript: text(n.transcript),
    };
    if (!/^clips\/[a-zA-Z0-9_-]+\.mp4$/.test(clip.video))
      throw new Error("Clips must be local clips/name.mp4 assets");
    if (n.kind === "complete") return { ...clip, kind: "complete" };
    if (n.kind === "explanation")
      return { ...clip, kind: "explanation", next: text(n.next) };
    if (
      n.kind !== "question" ||
      !Array.isArray(n.choices) ||
      n.choices.length < 2
    )
      throw new Error("Questions need at least two choices");
    const choices = n.choices.map((rawChoice) => {
      const c = record(rawChoice);
      return { id: text(c.id), label: text(c.label), target: text(c.target) };
    });
    if (new Set(choices.map((c) => c.id)).size !== choices.length)
      throw new Error("Duplicate choice ID");
    return { ...clip, kind: "question", prompt: text(n.prompt), choices };
  });
  const lesson: Lesson = {
    version: 1,
    id: text(root.id),
    title: text(root.title),
    start: text(root.start),
    nodes,
  };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (byId.size !== nodes.length) throw new Error("Duplicate node ID");
  if (!byId.has(lesson.start)) throw new Error("Missing start node");
  const edges = (n: LessonNode): string[] =>
    n.kind === "question"
      ? n.choices.map((c) => c.target)
      : n.kind === "explanation"
        ? [n.next]
        : [];
  for (const n of nodes)
    for (const target of edges(n))
      if (!byId.has(target)) throw new Error("Dangling transition");
  const reached = new Set<string>();
  function visit(id: string): void {
    if (reached.has(id)) return;
    reached.add(id);
    for (const next of edges(byId.get(id)!)) visit(next);
  }
  visit(lesson.start);
  if (reached.size !== nodes.length) throw new Error("Unreachable node");
  const canFinish = new Set(
    nodes.filter((n) => n.kind === "complete").map((n) => n.id),
  );
  for (let i = 0; i < nodes.length; i++)
    for (const n of nodes)
      if (edges(n).some((target) => canFinish.has(target))) canFinish.add(n.id);
  if (canFinish.size !== nodes.length)
    throw new Error("A node cannot reach completion");
  return lesson;
}
export function start(lesson: Lesson): Attempt {
  return { current: lesson.start, events: [] };
}
export function advance(
  lesson: Lesson,
  attempt: Attempt,
  action: Action,
): Attempt {
  if (action.from !== attempt.current) throw new Error("Stale action");
  if (attempt.events.length >= MAX_EVENTS)
    throw new Error("Attempt limit reached; restart the lesson");
  const node = lesson.nodes.find((n) => n.id === attempt.current);
  let target: string | undefined;
  if (node?.kind === "question")
    target = node.choices.find((c) => c.id === action.choice)?.target;
  else if (node?.kind === "explanation" && action.choice === undefined)
    target = node.next;
  if (!target) throw new Error("Invalid transition");
  return { current: target, events: [...attempt.events, { ...action }] };
}
export async function fingerprint(lesson: Lesson): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(lesson));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}
export function restore(
  lesson: Lesson,
  key: string,
  saved: string | null,
): Attempt {
  if (!saved) return start(lesson);
  try {
    const value = record(JSON.parse(saved));
    if (
      value.fingerprint !== key ||
      !Array.isArray(value.events) ||
      value.events.length > MAX_EVENTS
    )
      return start(lesson);
    let attempt = start(lesson);
    for (const raw of value.events) {
      const a = record(raw);
      const action: Action = { from: text(a.from) };
      if (a.choice !== undefined) action.choice = text(a.choice);
      attempt = advance(lesson, attempt, action);
    }
    return attempt;
  } catch {
    return start(lesson);
  }
}
export function serialize(key: string, attempt: Attempt): string {
  return JSON.stringify({ fingerprint: key, events: attempt.events });
}
