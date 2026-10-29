import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  advance,
  fingerprint,
  MAX_EVENTS,
  parseLesson,
  restore,
  serialize,
  start,
} from "../../src/engine";

const raw = JSON.parse(
  readFileSync(new URL("../../public/lesson.json", import.meta.url), "utf8"),
);
const fixture = () => structuredClone(raw);
const lesson = parseLesson(raw);

describe("branching and persistence", () => {
  it("takes a correction branch, returns and completes without mutating previous state", () => {
    const initial = start(lesson);
    const wrong = advance(lesson, initial, {
      from: "question",
      choice: "three",
    });
    expect(wrong.current).toBe("correction");
    const retry = advance(lesson, wrong, { from: "correction" });
    expect(retry.current).toBe("question");
    const done = advance(lesson, retry, { from: "question", choice: "one" });
    expect(done.current).toBe("success");
    expect(initial.events).toEqual([]);
    expect(done.events).toHaveLength(3);
  });
  it("uses an independently calculated answer for the numeric lesson", () => {
    const x = 2,
      alpha = 0.25;
    const next = x - alpha * 2 * x;
    expect(next).toBe(1);
    expect(next * next).toBeLessThan(x * x);
    expect(
      advance(lesson, start(lesson), { from: "question", choice: "one" })
        .current,
    ).toBe("success");
    expect((x + alpha * 2 * x) ** 2).toBeGreaterThan(x * x);
  });
  it.each([
    { from: "wrong", choice: "one" },
    { from: "question", choice: "missing" },
    { from: "question" },
  ])("rejects stale or invalid action %j", (action) => {
    expect(() => advance(lesson, start(lesson), action)).toThrow();
  });
  it("cannot advance a completed lesson or pass a choice to an explanation", () => {
    const done = advance(lesson, start(lesson), {
      from: "question",
      choice: "one",
    });
    expect(() => advance(lesson, done, { from: "success" })).toThrow();
    const wrong = advance(lesson, start(lesson), {
      from: "question",
      choice: "three",
    });
    expect(() =>
      advance(lesson, wrong, { from: "correction", choice: "one" }),
    ).toThrow();
  });
  it("round-trips the exact event path", async () => {
    const key = await fingerprint(lesson);
    const attempt = advance(lesson, start(lesson), {
      from: "question",
      choice: "three",
    });
    expect(restore(lesson, key, serialize(key, attempt))).toEqual(attempt);
  });
  it("changes fingerprint when content changes with the same lesson ID", async () => {
    const changed = fixture();
    changed.nodes[0].prompt += " Changed";
    const key = await fingerprint(lesson);
    const saved = serialize(
      key,
      advance(lesson, start(lesson), { from: "question", choice: "one" }),
    );
    const next = parseLesson(changed);
    expect(await fingerprint(next)).not.toBe(key);
    expect(restore(next, await fingerprint(next), saved)).toEqual(start(next));
  });
  it.each([null, "", "{", "null", "[]", "{}", '{"events":"bad"}'])(
    "recovers from invalid saved data %j",
    (saved) => {
      expect(restore(lesson, "key", saved)).toEqual(start(lesson));
    },
  );
  it.each(
    [
      [{ from: "success" }],
      [{ from: "question", choice: "other" }],
      [{ from: "question", choice: "one" }, { from: "success" }],
      [null],
      [{ from: 3 }],
      [{ from: "question", choice: false }],
    ].map((events) => ({ events })),
  )("replays and validates saved events %j", ({ events }) => {
    expect(
      restore(lesson, "key", JSON.stringify({ fingerprint: "key", events })),
    ).toEqual(start(lesson));
  });
  it("bounds looping attempts", () => {
    let attempt = start(lesson);
    for (let i = 0; i < MAX_EVENTS / 2; i++) {
      attempt = advance(lesson, attempt, { from: "question", choice: "three" });
      attempt = advance(lesson, attempt, { from: "correction" });
    }
    expect(() =>
      advance(lesson, attempt, { from: "question", choice: "one" }),
    ).toThrow("limit");
    const saved = serialize("key", attempt);
    expect(restore(lesson, "key", saved)).toEqual(attempt);
    const tooMany = JSON.parse(saved);
    tooMany.events.push({ from: "question", choice: "one" });
    expect(restore(lesson, "key", JSON.stringify(tooMany))).toEqual(
      start(lesson),
    );
  });
});

describe("manifest validation", () => {
  it.each([undefined, null, [], false, "x"])(
    "rejects non-objects %j",
    (value) => {
      expect(() => parseLesson(value)).toThrow();
    },
  );
  it.each([
    (v: any) => {
      v.version = 2;
    },
    (v: any) => {
      v.nodes = [];
    },
    (v: any) => {
      v.nodes = Array(101).fill(v.nodes[0]);
    },
    (v: any) => {
      v.title = "";
    },
    (v: any) => {
      v.id = 42;
    },
    (v: any) => {
      v.title = "x".repeat(10001);
    },
    (v: any) => {
      v.start = "absent";
    },
    (v: any) => {
      v.nodes[1].id = "question";
    },
    (v: any) => {
      v.nodes[0].choices[0].target = "absent";
    },
    (v: any) => {
      v.nodes[1].next = "absent";
    },
    (v: any) => {
      v.nodes[0].choices = [];
    },
    (v: any) => {
      v.nodes[0].choices[1].id = "one";
    },
    (v: any) => {
      v.nodes[0].kind = "execute-python";
    },
    (v: any) => {
      v.nodes[0].choices[1].target = "success";
    },
    (v: any) => {
      v.nodes[2].kind = "explanation";
      v.nodes[2].next = "success";
    },
  ])("rejects invalid graph %#", (mutate) => {
    const value = fixture();
    mutate(value);
    expect(() => parseLesson(value)).toThrow();
  });
  it.each([
    "https://example.com/a.mp4",
    "../a.mp4",
    "clips/../a.mp4",
    "javascript:alert(1)",
    "clips/a.svg",
  ])("rejects unsafe media path %s", (video) => {
    const value = fixture();
    value.nodes[0].video = video;
    expect(() => parseLesson(value)).toThrow("local");
  });
  it("retains malicious-looking text as data", () => {
    const value = fixture();
    value.title = '<img src=x onerror="alert(1)">';
    expect(parseLesson(value).title).toBe(value.title);
  });
});
