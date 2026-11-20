import {
  type BrowserContext,
  browserToolFacts,
  canonicalContent,
  type HandEditReportBody,
  mayShowNet,
} from "@hashintel/brunch-agent";

import {
  type SuccessorConversation,
  successorEndpoints,
  successorHeaders,
} from "../successor/successor-endpoints";

/** The bound document, as the reporter watches it. */
export interface HandEditDocument {
  /** Called after each change to the document. */
  readonly subscribe: (listener: () => void) => () => void;
  /** Its semantic revision, or `undefined` while it loads. */
  readonly revision: () => string | undefined;
}

/** The server refused a report; the reporter sends no more. */
export interface HandEditRefusal {
  readonly status: number;
  /** The server's own words, as it answered. */
  readonly reason: string;
}

/** A browser call as the panel runs or claims it. */
interface ReportedBrowserCall {
  readonly toolName: string;
  readonly signal: AbortSignal;
}

/** The panel's browser calls, as `reportAround` wraps them. */
export interface ReportedBrowserCalls {
  /** Claims a call an interactive card runs, where the calls offer it. */
  claim?(call: ReportedBrowserCall): Promise<unknown>;
  run(
    call: ReportedBrowserCall,
    execute: (input: unknown) => Promise<unknown>,
  ): Promise<void>;
}

/** How long the document stays unchanged before an edit is reported. */
const defaultIdleMs = 1000;
/** How long a report waits for its answer before it counts as lost. */
const reportTimeoutMs = 5000;

/**
 * Whether a call's successful result shows the model the net: a read, or a
 * change that moved the document, whose result reads the net back.
 */
const showsNet = (
  toolName: string,
  before: string | undefined,
  after: string | undefined,
) =>
  mayShowNet(toolName) &&
  (browserToolFacts(toolName).observesNet || before !== after);

/**
 * Tells the durable agents server when the user edits the bound document by
 * hand, as a `brunch.hand-edit` note the model reads, so it learns that its
 * view of the net is out of date.
 *
 * An edit is reported once the document has been idle for `idleMs`, and
 * before each browser call is claimed, whenever its revision differs from
 * the one the model was last told of or shown. That starts as what
 * `readShown` reads, so an edit no panel saw, such as one before a reload,
 * is reported at once; without it, or when it finds none or fails, as the
 * document's revision when the reporter starts. No report is sent while a
 * Brunch call runs, since the document moves under it; an edit made
 * meanwhile is reported as the last running call ends. A call whose result
 * shows the model the net closes the edit episode, and the next edit opens
 * another, so an episode spans the edits between two views.
 *
 * A report keeps its `<episode>:<seq>` identity until it is answered: a
 * lost answer is sent again unchanged, and the server admits it once. A
 * conversation that does not exist yet (404) has no view to make stale, so
 * the report is dropped; any other refusal, such as a binding to another
 * document (409) or another actor or web (403), stops reporting.
 */
export const createHandEditReporter = ({
  conversation,
  binding,
  document,
  idleMs = defaultIdleMs,
  readShown,
  onRefused,
}: {
  readonly conversation: SuccessorConversation;
  /** The panel's document binding, the one its chat transport sends. */
  readonly binding: BrowserContext["binding"];
  readonly document: HandEditDocument;
  readonly idleMs?: number;
  /**
   * Reads the revision the conversation last showed the model or told it
   * of, such as `readShownRevision`; no report is sent before it answers.
   */
  readonly readShown?: (signal: AbortSignal) => Promise<string | undefined>;
  readonly onRefused?: (refusal: HandEditRefusal) => void;
}) => {
  const boundTo = canonicalContent(binding);
  const request = conversation.fetch ?? globalThis.fetch;
  let endpoints: ReturnType<typeof successorEndpoints> | undefined;
  /** The revision the model was last told of or shown. */
  let known: string | undefined;
  let episode: { readonly id: string; nextSeq: number } | undefined;
  /** The report sent last whose answer never arrived. */
  let unanswered: HandEditReportBody | undefined;
  let runningCalls = 0;
  let refused = false;
  let reports: Promise<void> = Promise.resolve();
  let idle: ReturnType<typeof setTimeout> | undefined;
  /** Aborts when the reporter stops; absent before it starts. */
  let watching: AbortSignal | undefined;

  const nextReport = (revision: string): HandEditReportBody => {
    episode ??= { id: crypto.randomUUID(), nextSeq: 0 };
    const body = {
      binding: boundTo,
      episode: episode.id,
      seq: episode.nextSeq,
      revision,
    };
    episode.nextSeq += 1;
    return body;
  };

  const report = async () => {
    const signal = watching;
    if (refused || runningCalls > 0 || !signal || signal.aborted) return;
    const revision = document.revision();
    if (revision === undefined || revision === known) return;
    const body =
      unanswered?.revision === revision ? unanswered : nextReport(revision);
    unanswered = body;
    endpoints ??= successorEndpoints(conversation);
    let response: Response;
    try {
      response = await request((await endpoints).handEdits, {
        method: "POST",
        headers: {
          ...successorHeaders(conversation),
          "content-type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(body),
        signal: AbortSignal.any([signal, AbortSignal.timeout(reportTimeoutMs)]),
      });
    } catch {
      // Left unanswered: the next report sends it again.
      return;
    }
    if (response.ok || response.status === 404) {
      await response.body?.cancel();
      if (unanswered === body) unanswered = undefined;
      known = revision;
      return;
    }
    if (response.status >= 400 && response.status < 500) {
      refused = true;
      clearTimeout(idle);
      onRefused?.({ status: response.status, reason: await response.text() });
    }
  };

  /** Report now, after any report still waiting for its answer; never rejects. */
  const flush = () => {
    clearTimeout(idle);
    reports = reports.then(report).catch(() => {});
    return reports;
  };

  return {
    /** Watch the document from its current revision; the returned function stops. */
    start: () => {
      const stopping = new AbortController();
      watching = stopping.signal;
      known = document.revision();
      if (readShown !== undefined) {
        const seeded = readShown(stopping.signal).then(
          (shown) => {
            if (shown !== undefined && !stopping.signal.aborted) known = shown;
          },
          () => {},
        );
        reports = reports
          .then(() => seeded)
          .then(report)
          .catch(() => {});
      }
      const unsubscribe = document.subscribe(() => {
        known ??= document.revision();
        clearTimeout(idle);
        idle = setTimeout(() => {
          void flush();
        }, idleMs);
      });
      return () => {
        clearTimeout(idle);
        unsubscribe();
        stopping.abort();
      };
    },
    /**
     * The panel's browser calls, reporting an edit before each claim and
     * holding reports while each run lasts.
     */
    reportAround: <Calls extends ReportedBrowserCalls>(calls: Calls): Calls => {
      const claim = calls.claim?.bind(calls);
      const reported: ReportedBrowserCalls = {
        ...(claim === undefined
          ? {}
          : {
              claim: async (call) => {
                await flush();
                return claim(call);
              },
            }),
        run: async (call, execute) => {
          await flush();
          runningCalls += 1;
          let shown: string | undefined;
          try {
            await calls.run(call, async (input) => {
              const before = document.revision();
              const output = await execute(input);
              const after = document.revision();
              if (showsNet(call.toolName, before, after)) shown = after;
              return output;
            });
            if (shown !== undefined && !call.signal.aborted) {
              known = shown;
              episode = undefined;
              unanswered = undefined;
            }
          } finally {
            runningCalls -= 1;
            if (runningCalls === 0) void flush();
          }
        },
      };
      return { ...calls, ...reported };
    },
  };
};
