/**
 * `query_basis`: why a visible net element exists, from the Ledger records
 * that name it and the browser calls that changed it. Ported from Brunch's
 * `apps/brunch-agent/src/agents/petrinaut/tools/query-basis.ts` onto the
 * conversation's browser-call records and its `LedgerDoc`:
 *
 * - the net's changes and views are the settled records, in issue order
 *   (`net-changes.ts`), not settled tool parts in message order;
 * - a change's Ledger revision is the `LedgerDoc` as of the assistant entry
 *   that issued it (`snapshotAsOf`), not a fold of history cut at its part;
 * - the Ledger's turns get the USER's words from their input entries, which
 *   the stored Ledger history does not keep: a `brunch.user` entry's
 *   `data.userText`, or an older `pi.user` entry's message text, so the
 *   trace's turn excerpts are Brunch's;
 * - a hand edit after the model's view also answers `stale-read` (Lu's H8):
 *   the tool folds the conversation's current effective context with
 *   `visibleNetView`, the same staleness net freshness refuses on, so a note
 *   naming the revision a later view already saw is ignored.
 *
 * It runs sequentially (fold 3b): one sequential tool serializes its whole
 * round in call order, so it answers from the net reads issued before it in
 * the same response, and never from the ones after.
 */
import {
  type ConversationId,
  defineExtension,
  defineTool,
  type EntryId,
  type EntryRecord,
  type ToolExecutionApi,
} from "@earendil-works/pi-durable";
import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

import {
  type ArcElement,
  arcDirections,
  brunchTools,
  foldCommits,
  generatedArcId,
  type LedgerHistory,
  type LedgerTrace,
  namesId,
  type NetElementAddress,
  netElementKinds,
  type NetStructure,
  traceLedger,
} from "@hashintel/brunch-agent";

import {
  BrowserBindingDoc,
  BrowserCallsDoc,
} from "../browser-call/browser-call";
import { foldLedger, LedgerDoc } from "../ledger";
import {
  callsForElement,
  isAppliedChange,
  issuedBefore,
  latestNetDefinition,
  type NetCall,
  netCalls,
  type NetElement,
} from "./net-changes";
import { type VisibleNetView, visibleNetView } from "./visible-net-view";

import type { HostBinding } from "../agent/host-binding";
import type { Context } from "@earendil-works/chord";
import type { Schema } from "@earendil-works/pi-schema";

/** Copied from Brunch's `query-basis.ts`. */
export const queryBasisToolDescription =
  "Use when the USER asks why a visible net element exists or is modelled as it is, instead of answering from memory. Finds the element in the latest net read, or in the net read back after a later change, and returns its recorded basis: the reflections that name the element and, behind them, the claims, entities and discharged obligations they rest on, each with its ID, and the conversation turns those records came from, each with its ID and the opening of the USER's words. Answer from that basis and cite its record IDs. Cite every returned turn too, by quoting the opening of the USER's words, never by its ID, so the USER can see what they said that the answer rests on. A claim under `superseded` was later replaced: say so, and give its replacement. It also lists the canonical calls that changed the element, with their document and Ledger revisions. A basis-absent disposition means no reflection names the element: say plainly that its basis was not recorded rather than reconstructing one. You may point to related records, but do not offer a rationale of your own for it. A stale-read disposition means the net changed after the latest net view, a read or a change's read-back, without a later read-back: read it again, then query.";

const elementSchema = v.object({
  selector: v.pipe(
    v.object({
      kind: v.picklist(netElementKinds),
      name: v.optional(
        v.pipe(
          v.string(),
          v.description("The element's recorded name, unique within its kind."),
        ),
      ),
      id: v.optional(v.pipe(v.string(), v.description("The element's ID."))),
      transitionId: v.optional(
        v.pipe(v.string(), v.description("For an arc: its transition's ID.")),
      ),
      arcDirection: v.optional(
        v.pipe(
          v.picklist(arcDirections),
          v.description(
            "For an arc: its direction relative to the transition.",
          ),
        ),
      ),
      placeId: v.optional(
        v.pipe(v.string(), v.description("For an arc: its place's ID.")),
      ),
    }),
    v.description(
      "One element by kind and its name or ID; an arc by transitionId, arcDirection and placeId.",
    ),
  ),
});
type ElementQuery = v.InferOutput<typeof elementSchema>;
export type Selector = ElementQuery["selector"];

/** A net element the selector can match: by ID, by name, or by its arc's endpoints. */
type ElementCandidate = Omit<NetElement, "kind"> & { readonly name: string };

/** The root net and each subnet: places, transitions and their other items can sit in either. */
const netsOf = (definition: NetStructure) => [
  definition,
  ...(definition.subnets ?? []),
];

const netElements = (
  net: ReturnType<typeof netsOf>[number],
  kind: Exclude<Selector["kind"], "scenario" | "metric" | "subnet">,
): ElementCandidate[] => {
  if (kind === "place") return net.places;
  if (kind === "transition") return net.transitions;
  if (kind === "type") return net.types;
  if (kind === "parameter") return net.parameters;
  if (kind === "differentialEquation") return net.differentialEquations;
  if (kind === "componentInstance") return net.componentInstances ?? [];
  if (kind === "typeElement")
    return net.types.flatMap((color) =>
      color.elements.map((element) => ({
        id: element.elementId,
        name: element.name,
      })),
    );
  // An arc is selected by its transition and endpoint, and identified by the ID Petrinaut generates from them.
  return net.transitions.flatMap((transition) => {
    const arcElements = (
      arcDirection: ArcElement["arcDirection"],
      arcs: readonly Pick<
        (typeof transition.inputArcs)[number],
        "endpoint" | "placeId"
      >[],
    ) =>
      arcs.map((arc) => {
        const placeId =
          arc.endpoint?.kind === "place"
            ? arc.endpoint.placeId
            : (arc.placeId ?? "");
        const element = { transitionId: transition.id, arcDirection, placeId };
        return {
          arc: element,
          id: generatedArcId(element),
          name: `${transition.name} ${arcDirection}`,
        };
      });
    return [
      ...arcElements("input", transition.inputArcs),
      ...arcElements("output", transition.outputArcs),
    ];
  });
};

const elements = (
  definition: NetStructure,
  kind: Selector["kind"],
): ElementCandidate[] => {
  if (kind === "scenario") return definition.scenarios ?? [];
  if (kind === "metric") return definition.metrics ?? [];
  if (kind === "subnet") return definition.subnets ?? [];
  return netsOf(definition).flatMap((net) => netElements(net, kind));
};

/** A record as the model reads it: its ID and fields, with the turn it was recorded in. */
const recordContent = <Fields extends { address: string }>({
  address,
  ...fields
}: Fields) => ({ id: address, ...fields });

/** The trace as the model reads it: record IDs in place of addresses. */
const basisContent = (trace: LedgerTrace) => ({
  reflections: trace.reflections.map(recordContent),
  obligations: trace.obligations.map(recordContent),
  claims: trace.claims.map(recordContent),
  entities: trace.entities.map(recordContent),
  superseded: trace.superseded,
  turns: trace.turns,
});

/** Whether a reflection's net element address names the target, as the document or the model wrote it. */
const namesTarget =
  (kind: Selector["kind"], target: Omit<NetElement, "kind">) =>
  (address: NetElementAddress) =>
    address.kind === kind && namesId(address.id, target.id);

export type QueryBasisInput = {
  /** The browser's settled net calls, in issue order (`netCalls`). */
  readonly calls: readonly NetCall[];
  /** The Ledger's history now, with the USER's words on its turns. */
  readonly ledger: LedgerHistory;
  /** The conversation's editor binding, as Brunch reports it. */
  readonly binding: unknown;
  readonly query: Selector;
  /** The Ledger revision as of the entry that issued a call. */
  readonly ledgerRevisionAt: (call: NetCall) => Promise<number | undefined>;
  /** The model's view now, from its effective context (`visibleNetView`'s state). */
  readonly netView: VisibleNetView["state"];
};

export const queryBasis = async (input: QueryBasisInput) => {
  // The latest read, or the latest change carrying its read-back; a change
  // after it carried none.
  const latest = latestNetDefinition(input.calls);
  const view = latest?.call;
  if (input.netView === "stale")
    return {
      binding: input.binding,
      disposition: "stale-read" as const,
      reason:
        "The USER changed the net in the editor after the latest net view; read it again, then query.",
      target: undefined,
      readToolCallId: view?.toolCallId,
      basis: undefined,
      changes: [],
    };
  if (
    view &&
    input.calls.some(
      (call) => isAppliedChange(call) && issuedBefore(view, call),
    )
  )
    return {
      binding: input.binding,
      disposition: "stale-read" as const,
      reason:
        "The net changed after the latest net view without a subsequent read-back; read it again, then query.",
      target: undefined,
      readToolCallId: view.toolCallId,
      basis: undefined,
      changes: [],
    };
  const candidates = latest
    ? elements(latest.definition, input.query.kind).filter(
        (element) =>
          namesId(input.query.id, element.id) ||
          (input.query.name !== undefined &&
            element.name === input.query.name) ||
          (input.query.kind === "arc" &&
            element.arc !== undefined &&
            namesId(input.query.transitionId, element.arc.transitionId) &&
            input.query.arcDirection === element.arc.arcDirection &&
            namesId(input.query.placeId, element.arc.placeId)),
      )
    : [];
  const target = candidates.length === 1 ? candidates.at(0) : undefined;
  if (!target)
    return {
      binding: input.binding,
      disposition: "not-found" as const,
      reason:
        "The named element is absent or ambiguous in the latest net view.",
      target,
      readToolCallId: latest?.call.toolCallId,
      basis: undefined,
      changes: [],
    };
  const changes = await Promise.all(
    callsForElement(input.calls, {
      kind: input.query.kind,
      id: target.id,
      ...(target.arc === undefined ? {} : { arc: target.arc }),
    }).map(async (call) => ({
      toolCallId: call.toolCallId,
      operation: call.toolName,
      petrinautRevisionId: call.revisionAfter,
      ledgerRevision: await input.ledgerRevisionAt(call),
    })),
  );
  const trace = traceLedger(foldCommits(input.ledger).state, {
    netElement: namesTarget(input.query.kind, target),
  });
  const declared = trace.reflections.length > 0;
  return {
    binding: input.binding,
    disposition: declared
      ? ("basis-declared" as const)
      : ("basis-absent" as const),
    reason: declared
      ? "Reflections name this element; the basis is what they rest on."
      : "No reflection names this element, so its basis was not recorded.",
    target,
    readToolCallId: latest?.call.toolCallId,
    basis: declared ? basisContent(trace) : undefined,
    changes,
  };
};

/** The USER's words of an older `pi.user` entry's message. */
const userText = (content: string | readonly { type: string }[]) =>
  typeof content === "string"
    ? content
    : content
        .flatMap((part) =>
          part.type === "text" &&
          "text" in part &&
          typeof part.text === "string"
            ? [part.text]
            : [],
        )
        .join(" ");

/** The kind `POST /chat` admits the USER's messages as (`user-input.ts`). */
const brunchUserKind = "brunch.user";

/**
 * The USER's words a `brunch.user` entry keeps, as `POST /chat` admitted
 * them: its `data.userText`. An envelope that did not parse keeps none.
 */
const wordsOf = (entry: EntryRecord | undefined): string | undefined => {
  if (entry?.kind !== brunchUserKind) return undefined;
  const { data } = entry;
  return typeof data === "object" &&
    data !== null &&
    "userText" in data &&
    typeof data.userText === "string"
    ? data.userText
    : undefined;
};

/** The conversation's Ledger history, its turns given the USER's words from their entries. */
const ledgerWithWords = async (
  api: ToolExecutionApi,
  conversationId: ConversationId,
  context: Context,
): Promise<LedgerHistory> => {
  const stored = await api.snapshot(LedgerDoc, conversationId, context);
  const messages = stored?.messages ?? [];
  const words = await api.commit(
    async (tx) =>
      new Map(
        await Promise.all(
          messages
            .filter(({ role }) => role === "user")
            .map(async ({ id }) => {
              const entry = await tx.entry(Number(id) as EntryId);
              const message = entry?.model?.[0];
              return [
                id,
                wordsOf(entry) ??
                  (message?.role === "user" ? userText(message.content) : ""),
              ] as const;
            }),
        ),
      ),
    context,
  );
  return {
    messages: messages.map((message) =>
      message.role === "user"
        ? {
            id: message.id,
            role: message.role,
            parts: [{ type: "text", text: words.get(message.id) ?? "" }],
          }
        : message,
    ),
  };
};

/** The binding Brunch reports: `BrowserContext["binding"]`, stored as its canonical JSON. */
const bindingOf = (binding: string | null | undefined): unknown =>
  binding === null || binding === undefined ? null : JSON.parse(binding);

/**
 * The model's view of the net now: the conversation's current effective
 * context through the host, outside any commit. Throws when the host is
 * unbound, which fails the call as a tool error.
 */
const netViewNow = async (
  host: HostBinding,
  conversationId: ConversationId,
  context: Context,
) =>
  visibleNetView(
    await (await host.conversation(conversationId, context)).context(context),
  ).state;

/** `query_basis` over a Harness's host binding. */
export const createQueryBasisTool = (host: HostBinding) =>
  defineTool({
    name: brunchTools.queryBasis,
    description: queryBasisToolDescription,
    parameters: (({ $schema: _dialect, ...jsonSchema }) => jsonSchema)(
      toJsonSchema(elementSchema, { errorMode: "ignore" }),
    ) as Schema<ElementQuery>,
    // Reads only.
    replay: "safe",
    // Answers from the reads issued before it in the same response (fold 3b).
    executionMode: "sequential",
    execute: async (args, api, context) => {
      const { selector } = v.parse(elementSchema, args);
      const { conversationId } = api;
      const [records, bound, ledger, netView] = await Promise.all([
        api.snapshot(BrowserCallsDoc, conversationId, context),
        api.snapshot(BrowserBindingDoc, conversationId, context),
        ledgerWithWords(api, conversationId, context),
        netViewNow(host, conversationId, context),
      ]);
      const result = await queryBasis({
        netView,
        calls: netCalls(records?.calls ?? {}),
        ledger,
        binding: bindingOf(bound?.binding),
        query: selector,
        ledgerRevisionAt: async ({ issuedEntry }) =>
          foldLedger(
            await api.snapshotAsOf(
              LedgerDoc,
              conversationId,
              issuedEntry as EntryId,
              context,
            ),
          ).revision,
      });
      return { output: [{ type: "text", text: JSON.stringify(result) }] };
    },
  });

/** `query_basis`, for an agent that also selects the Ledger and the Petrinaut browser tools. */
export const queryBasisExtension = (host: HostBinding) =>
  defineExtension({
    name: "brunch.query-basis",
    tools: [createQueryBasisTool(host)],
  });
