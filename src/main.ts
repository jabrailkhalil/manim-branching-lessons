import "./style.css";
import {
  advance,
  fingerprint,
  parseLesson,
  restore,
  serialize,
  start,
  type Action,
  type Attempt,
} from "./engine";

const app = document.querySelector<HTMLDivElement>("#app")!;
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
async function boot(): Promise<void> {
  const response = await fetch("./lesson.json");
  if (!response.ok) throw new Error("The lesson manifest could not be loaded");
  const lesson = parseLesson(await response.json());
  document.querySelector("h1")!.textContent = lesson.title;
  document.title = `${lesson.title} · Branching lessons`;
  const key = await fingerprint(lesson);
  const storageKey = `branching-lesson:${lesson.id}`;
  let notice = "";
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(storageKey);
  } catch {
    notice =
      "Browser storage is unavailable. Progress will last for this tab only.";
  }
  let attempt: Attempt = restore(lesson, key, saved);
  function save(): void {
    try {
      localStorage.setItem(storageKey, serialize(key, attempt));
    } catch {
      notice = "Progress could not be saved. You can continue in this tab.";
    }
  }
  function act(action: Action): void {
    try {
      attempt = advance(lesson, attempt, action);
      save();
      render(true);
    } catch (error) {
      notice = error instanceof Error ? error.message : "Unable to continue";
      render(false);
    }
  }
  function render(focus: boolean): void {
    const node = lesson.nodes.find((n) => n.id === attempt.current)!;
    app.replaceChildren();
    app.setAttribute("aria-busy", "false");
    const panel = el("section");
    panel.className = "lesson";
    const heading = el("h2", node.title);
    heading.tabIndex = -1;
    const video = el("video");
    video.src = `./${node.video}`;
    video.poster = `./${node.video.replace(/\.mp4$/, ".png")}`;
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    video.setAttribute("aria-label", node.title);
    video.append(
      el("p", "Video playback is unavailable; read the transcript below."),
    );
    const videoError = el("p");
    videoError.setAttribute("role", "status");
    video.addEventListener("error", () => {
      videoError.textContent =
        "The clip could not be played. The complete explanation is in the transcript below.";
    });
    const play = el("button", "Play clip");
    play.className = "secondary";
    play.onclick = () => {
      void video.play().catch(() => {
        videoError.textContent =
          "Playback was blocked. Use the video controls or the transcript.";
      });
    };
    const transcript = el("details");
    transcript.append(
      el("summary", "Read the transcript"),
      el("p", node.transcript),
    );
    const actionArea = el("div");
    actionArea.className = "actions";
    if (node.kind === "question") {
      actionArea.append(el("h3", node.prompt));
      for (const choice of node.choices) {
        const button = el("button", choice.label);
        button.onclick = () => act({ from: node.id, choice: choice.id });
        actionArea.append(button);
      }
    } else if (node.kind === "explanation") {
      const button = el("button", "Try the question again");
      button.onclick = () => act({ from: node.id });
      actionArea.append(button);
    } else {
      actionArea.append(
        el("p", "Lesson complete. You found the downhill step."),
      );
    }
    const trail = el(
      "p",
      `${attempt.events.length} transition${attempt.events.length === 1 ? "" : "s"} in this attempt`,
    );
    trail.className = "muted";
    const reset = el("button", "Restart lesson");
    reset.className = "secondary";
    reset.onclick = () => {
      attempt = start(lesson);
      notice = "";
      save();
      render(true);
    };
    const status = el("p", notice);
    status.setAttribute("role", "status");
    panel.append(
      heading,
      video,
      play,
      videoError,
      transcript,
      actionArea,
      trail,
      reset,
      status,
    );
    app.append(panel);
    if (focus) heading.focus();
  }
  render(false);
}
void boot().catch((error: unknown) => {
  app.setAttribute("aria-busy", "false");
  const message = el(
    "p",
    error instanceof Error ? error.message : "The lesson could not be loaded",
  );
  message.setAttribute("role", "alert");
  app.replaceChildren(message);
});
