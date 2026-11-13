/**
 * Candidate A: a prompt section restores the model's last visible net view
 * after native compaction, when the summary dropped it.
 *
 * The section renders during request preparation; Pi stores its contribution
 * as a `pi.system` entry before it fixes the request's cutoff, and after
 * every compaction head it writes a complete baseline, which leads the
 * context. So the restored view is stored, not a request rewrite.
 *
 * The view at the end of the summarized prefix comes from one of:
 * - `context`: the pre-compaction context, read through the Harness the host
 *   closes over (no document, no hook);
 * - `document`: a document a `beforeCompact` hook writes through that Harness
 *   (`HookApi` is read-only), keyed by the compaction's `firstKept`;
 * - `documentOnly`: that document alone, without the context read; it cannot
 *   see the head or the retained tail.
 *
 * Native summarization runs throughout: the hook returns nothing, and the
 * faux summary never carries a net view.
 */
import { SystemEntry } from "@earendil-works/pi-durable";
import { describe, expect, test } from "vitest";

import { allEntries, call, fauxAssistantMessage, shapeOf } from "../support";
import {
  type Browser,
  compactionHead,
  createCounters,
  committedContextBefore,
  context,
  filler,
  firstAnswerAfter,
  handEdit,
  lastVisibleView,
  netEvent,
  netText,
  openProbe,
  type PrefixSource,
  PrefixViewDoc,
  type Probe,
  sectionExtensions,
  sectionKey,
  sectionText,
} from "./support";

import type { Message } from "@earendil-works/pi-ai";

const r1 = { revision: "R1", structure: "places: Dryer" };
const r2 = { revision: "R2", structure: "places: Dryer, Washer" };
const r3 = { revision: "R3", structure: "places: Dryer, Washer, Iron" };

/** The restored section as it appears in a request. */
const restored = (view: typeof r1) =>
  `<${sectionKey}>\n${sectionText(view)}\n</${sectionKey}>`;

const sectionOf = (messages: readonly Message[]) =>
  messages.flatMap((message) =>
    message.role === "system" &&
    typeof message.sections?.[sectionKey] === "string"
      ? [message.sections[sectionKey]]
      : [],
  );

/** How many net views (not notices) a request shows. */
const viewCount = (messages: readonly Message[]) =>
  messages.filter((message) => netEvent(message)?.kind === "view").length;

const open = (
  source: PrefixSource,
  options?: { contextWindow?: number; browser?: Browser },
) => {
  const counters = createCounters();
  const browser = options?.browser ?? { current: r1 };
  return openProbe({
    browser,
    contextWindow: options?.contextWindow,
    extensions: sectionExtensions(source, counters),
  }).then((probe) => ({ ...probe, browser, counters }));
};

/** Read the net, then chat once: the read sits early in the transcript. */
const readThenChat = async (probe: Probe) => {
  probe.model.script(
    call("readNet", "read-1"),
    fauxAssistantMessage("It has a dryer."),
    fauxAssistantMessage("Noted."),
  );
  await probe.ask("Look at the net.");
  await probe.ask("It dries clothes.");
};

/** Ask once more after a compaction; returns that request and its context. */
const askAfterCompaction = async (probe: Probe, content: string) => {
  const head = await compactionHead(probe.root);
  probe.model.script(fauxAssistantMessage("OK."));
  const before = probe.model.requests.length;
  await probe.ask(content);
  const request = probe.model.requests[before]!;
  const committed = await committedContextBefore(
    probe.root,
    await firstAnswerAfter(probe.root, head.id),
  );
  return { head, request, committed };
};

const systemEntriesAfter = async (probe: Probe, id: number) =>
  (await allEntries(probe.root)).filter(
    (entry) => SystemEntry.is(entry) && entry.id > id,
  );

const variants: PrefixSource[] = [{ kind: "context" }, { kind: "document" }];

describe.each(variants)("A: net_view section, prefix from $kind", (source) => {
  test("1, 2, 9: the read is summarized; the first request after compaction leads with the restored view, and equals the committed context", async () => {
    const probe = await open(source);
    try {
      await readThenChat(probe);
      expect(await probe.compact()).toMatchObject({ status: "completed" });
      const { head, request, committed } = await askAfterCompaction(
        probe,
        "Add a second dryer.",
      );
      // The read's result was summarized away, and the summary has no view.
      expect(
        shapeOf(request).some((shape) => shape.startsWith("result:read-1")),
      ).toBe(false);
      expect(probe.model.summaries).toHaveLength(1);
      // The baseline Pi writes after the head leads the request and carries the view.
      expect(request[0]).toMatchObject({
        role: "system",
        sections: { [sectionKey]: restored(r1) },
      });
      expect(lastVisibleView(request)).toEqual({ kind: "view", ...r1 });
      // No rewrite: the request is the committed context before its answer.
      expect(request).toEqual(committed);
      // Placement cost: still exactly one system entry after the head, the baseline Pi writes anyway.
      expect(await systemEntriesAfter(probe, head.id)).toHaveLength(1);
      const doc = await probe.harness.snapshot(
        PrefixViewDoc,
        probe.root.id,
        context,
      );
      // Only the document variant has a hook; it ran once and recorded the prefix's view.
      expect(probe.counters.values.hookCalls).toBe(
        source.kind === "document" ? 1 : 0,
      );
      expect(doc?.byFirstKept[String(head.head)]).toEqual(
        source.kind === "document" ? { kind: "view", ...r1 } : undefined,
      );
      process.stdout.write(
        `A(${source.kind}) first request after compaction: ${JSON.stringify(shapeOf(request))}; section chars ${restored(r1).length}\n`,
      );
    } finally {
      await probe.close();
    }
  });

  test("3: the latest view is in the retained tail; nothing is restored, so nothing is duplicated", async () => {
    const probe = await open(source);
    try {
      probe.model.script(
        fauxAssistantMessage(filler("Hello.")),
        call("readNet", "read-1"),
        fauxAssistantMessage("It has a dryer."),
      );
      await probe.ask("Hello.");
      await probe.ask("Look at the net.");
      // Keep the tail from the long answer on: the read stays verbatim.
      probe.compaction.keepRecentTokens = 300;
      expect(await probe.compact()).toMatchObject({ status: "completed" });
      const { request, committed } = await askAfterCompaction(
        probe,
        "Add a second dryer.",
      );
      expect(shapeOf(request)).toContain(`result:read-1:${netText(r1)}`);
      expect(sectionOf(request)).toEqual([]);
      expect(viewCount(request)).toBe(1);
      expect(lastVisibleView(request)).toEqual({ kind: "view", ...r1 });
      expect(request).toEqual(committed);
    } finally {
      await probe.close();
    }
  });

  test("4: a hand edit after the view, in the retained tail: no view is restored", async () => {
    const probe = await open(source);
    try {
      probe.model.script(
        call("readNet", "read-1"),
        fauxAssistantMessage(filler("It has a dryer.")),
        fauxAssistantMessage("Fine."),
      );
      await probe.ask("Look at the net.");
      await handEdit(probe.root, "R2");
      await probe.ask("Anything else?");
      probe.compaction.keepRecentTokens = 300;
      expect(await probe.compact()).toMatchObject({ status: "completed" });
      const { request } = await askAfterCompaction(probe, "Add a dryer.");
      // The read was summarized; the notice was kept.
      expect(
        shapeOf(request).some((shape) => shape.startsWith("result:read-1")),
      ).toBe(false);
      expect(sectionOf(request)).toEqual([]);
      expect(lastVisibleView(request)).toEqual({
        kind: "stale",
        revision: "R2",
      });
    } finally {
      await probe.close();
    }
  });

  test("4: a hand edit after the view, both summarized: no view is restored", async () => {
    const probe = await open(source);
    try {
      probe.model.script(
        call("readNet", "read-1"),
        fauxAssistantMessage("It has a dryer."),
        fauxAssistantMessage("Fine."),
      );
      await probe.ask("Look at the net.");
      await handEdit(probe.root, "R2");
      await probe.ask("Anything else?");
      expect(await probe.compact()).toMatchObject({ status: "completed" });
      const { request } = await askAfterCompaction(probe, "Add a dryer.");
      expect(sectionOf(request)).toEqual([]);
      // Neither view nor notice is visible: the conversation refuses until it reads again.
      expect(lastVisibleView(request)).toBeUndefined();
    } finally {
      await probe.close();
    }
  });

  test("5: the restored view is the last visible one, not a details-only revision or newer browser state", async () => {
    const browser: Browser = { current: r1 };
    const probe = await open(source, { browser });
    try {
      probe.model.script(
        call("readNet", "read-1"),
        fauxAssistantMessage("It has a dryer."),
        call("failNet", "fail-1"),
        fauxAssistantMessage("That failed."),
      );
      await probe.ask("Look at the net.");
      browser.current = r2;
      await probe.ask("Add a washer.");
      browser.current = r3;
      // The failed call's details name R2; the model was never shown it.
      const failed = (await probe.root.context(context)).messages.find(
        (message) =>
          message.role === "toolResult" && message.toolCallId === "fail-1",
      );
      expect(failed).toMatchObject({
        isError: true,
        details: { revision: "R2" },
      });
      expect(await probe.compact()).toMatchObject({ status: "completed" });
      const { request } = await askAfterCompaction(probe, "Add an iron.");
      expect(sectionOf(request)).toEqual([restored(r1)]);
      expect(lastVisibleView(request)).toEqual({ kind: "view", ...r1 });
    } finally {
      await probe.close();
    }
  });

  test("6: a second compaction keeps the view, though the restored view itself is summarized", async () => {
    const probe = await open(source);
    try {
      await readThenChat(probe);
      await probe.compact();
      const first = await askAfterCompaction(probe, "Add a second dryer.");
      const [baseline] = await systemEntriesAfter(probe, first.head.id);
      probe.model.script(fauxAssistantMessage("Sure."));
      await probe.ask("And a third?");
      expect(await probe.compact()).toMatchObject({ status: "completed" });
      const second = await askAfterCompaction(probe, "Go on.");
      expect(second.head.id).not.toBe(first.head.id);
      // The first restoration's baseline was in the summarized prefix.
      expect(baseline!.id).toBeLessThan(second.head.head!);
      expect(probe.model.summaries).toHaveLength(2);
      // Native summarization does not see system messages, so it could not carry the view.
      expect(JSON.stringify(probe.model.summaries[1])).not.toContain(
        netText(r1),
      );
      expect(sectionOf(second.request)).toEqual([restored(r1)]);
      expect(lastVisibleView(second.request)).toEqual({ kind: "view", ...r1 });
      expect(second.request).toEqual(second.committed);
      expect(probe.counters.values.hookCalls).toBe(
        source.kind === "document" ? 2 : 0,
      );
    } finally {
      await probe.close();
    }
  });

  test("7: a new Harness over the same storage between the compaction and the next request still restores the view", async () => {
    const first = await open(source);
    let reopened: Probe | undefined;
    try {
      await readThenChat(first);
      await first.compact();
      await first.close();
      reopened = await openProbe({
        browser: first.browser,
        storage: first.storage,
        extensions: sectionExtensions(source),
      });
      const { request, committed } = await askAfterCompaction(
        reopened,
        "Add a second dryer.",
      );
      // The new Harness made the request: the old one's model saw no new request.
      expect(reopened.model.requests).toHaveLength(1);
      expect(sectionOf(request)).toEqual([restored(r1)]);
      expect(request).toEqual(committed);
    } finally {
      await reopened?.close();
    }
  });

  test("8: a hand edit admitted while the summary is generated lands in the retained tail; no view is restored", async () => {
    const probe = await open(source);
    try {
      await readThenChat(probe);
      let release = () => undefined as void;
      let entered = () => undefined as void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const summarizing = new Promise<void>((resolve) => {
        entered = resolve;
      });
      probe.model.control.summarize = async () => {
        entered();
        await gate;
        return fauxAssistantMessage("## Goal\nModel a laundry.");
      };
      const compaction = probe.compact();
      await summarizing;
      const edit = await handEdit(probe.root, "R2");
      expect(await edit.status(context)).toMatchObject({ status: "done" });
      release();
      expect(await compaction).toMatchObject({ status: "completed" });
      const { head, request } = await askAfterCompaction(probe, "Add a dryer.");
      // Placed before the summary entry but after firstKept: kept verbatim, after the head.
      const editEntry = (await edit.status(context)).entry!;
      expect(editEntry).toBeGreaterThan(head.head!);
      expect(editEntry).toBeLessThan(head.id);
      expect(sectionOf(request)).toEqual([]);
      expect(lastVisibleView(request)).toEqual({
        kind: "stale",
        revision: "R2",
      });
      // The hook (document variant) recorded the prefix's own state; the later notice is not attributed to it.
      const doc = await probe.harness.snapshot(
        PrefixViewDoc,
        probe.root.id,
        context,
      );
      expect(doc?.byFirstKept[String(head.head)]).toEqual(
        source.kind === "document" ? { kind: "view", ...r1 } : undefined,
      );
    } finally {
      await probe.close();
    }
  });

  test("8: a whole run that reads the net while the summary is generated is kept; its view wins and nothing is restored", async () => {
    const browser: Browser = { current: r1 };
    const probe = await open(source, { browser });
    try {
      await readThenChat(probe);
      let release = () => undefined as void;
      let entered = () => undefined as void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const summarizing = new Promise<void>((resolve) => {
        entered = resolve;
      });
      probe.model.control.summarize = async () => {
        entered();
        await gate;
        return fauxAssistantMessage("## Goal\nModel a laundry.");
      };
      const compaction = probe.compact();
      await summarizing;
      browser.current = r2;
      probe.model.script(
        call("readNet", "read-2"),
        fauxAssistantMessage("Now a washer too."),
      );
      await probe.ask("Look again.");
      release();
      expect(await compaction).toMatchObject({ status: "completed" });
      const { request } = await askAfterCompaction(probe, "Add an iron.");
      expect(shapeOf(request)).toContain(`result:read-2:${netText(r2)}`);
      expect(sectionOf(request)).toEqual([]);
      expect(lastVisibleView(request)).toEqual({ kind: "view", ...r2 });
    } finally {
      await probe.close();
    }
  });

  test("9: a view or notice after the restoration adds no section patch; the notice still invalidates", async () => {
    const browser: Browser = { current: r1 };
    const probe = await open(source, { browser });
    try {
      await readThenChat(probe);
      await probe.compact();
      const { head } = await askAfterCompaction(probe, "Add a second dryer.");
      browser.current = r2;
      probe.model.script(
        call("readNet", "read-2"),
        fauxAssistantMessage("Washer seen."),
      );
      await probe.ask("Look again.");
      await handEdit(probe.root, "R3");
      probe.model.script(fauxAssistantMessage("OK."));
      await probe.ask("Go on.");
      const request = probe.model.requests.at(-1)!;
      // The restored view stays in the baseline; no later system entry.
      expect(await systemEntriesAfter(probe, head.id)).toHaveLength(1);
      expect(sectionOf(request)).toEqual([restored(r1)]);
      expect(lastVisibleView(request)).toEqual({
        kind: "stale",
        revision: "R3",
      });
      process.stdout.write(
        `A(${source.kind}) work over ${probe.model.requests.length} requests: ${JSON.stringify(probe.counters.values)}\n`,
      );
    } finally {
      await probe.close();
    }
  });

  test("1: a blocking threshold compaction inside a run; the request right after it carries the view", async () => {
    const probe = await open(source, { contextWindow: 4000 });
    try {
      probe.model.script(
        call("readNet", "read-1"),
        fauxAssistantMessage(filler("One.")),
        fauxAssistantMessage(filler("Two.")),
        fauxAssistantMessage(filler("Three.")),
      );
      await probe.ask("Look at the net.");
      await probe.ask("More.");
      await probe.ask("More still.");
      Object.assign(probe.compaction, {
        enabled: true,
        reserveTokens: 2000,
        keepRecentTokens: 1,
      });
      const { request, committed } = await (async () => {
        probe.model.script(fauxAssistantMessage("Added."));
        const before = probe.model.requests.length;
        await probe.ask("Add a second dryer.");
        probe.compaction.enabled = false;
        const head = await compactionHead(probe.root);
        return {
          request: probe.model.requests[before]!,
          committed: await committedContextBefore(
            probe.root,
            await firstAnswerAfter(probe.root, head.id),
          ),
        };
      })();
      expect(probe.model.summaries).toHaveLength(1);
      expect((await compactionHead(probe.root)).data).toEqual({
        reason: "threshold",
      });
      expect(sectionOf(request)).toEqual([restored(r1)]);
      expect(request).toEqual(committed);
    } finally {
      await probe.close();
    }
  });
});

describe("A: net_view section from the document alone (no context read)", () => {
  test("4 fails: it restores the prefix view although a hand edit kept in the tail invalidated it", async () => {
    const probe = await open({ kind: "documentOnly" });
    try {
      probe.model.script(
        call("readNet", "read-1"),
        fauxAssistantMessage(filler("It has a dryer.")),
        fauxAssistantMessage("Fine."),
      );
      await probe.ask("Look at the net.");
      await handEdit(probe.root, "R2");
      await probe.ask("Anything else?");
      probe.compaction.keepRecentTokens = 300;
      await probe.compact();
      const { request } = await askAfterCompaction(probe, "Add a dryer.");
      // Obligation 4 fails: a view is restored although the kept notice invalidated it.
      expect(sectionOf(request)).toEqual([restored(r1)]);
      // Freshness still ends stale, since the baseline leads and the notice follows it.
      expect(lastVisibleView(request)).toEqual({
        kind: "stale",
        revision: "R2",
      });
    } finally {
      await probe.close();
    }
  });
});
