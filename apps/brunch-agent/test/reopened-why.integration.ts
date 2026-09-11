/** Opt-in continuation of the existing actual-Chrome entrypoint. No fabricated browser results. */
/* eslint-disable no-await-in-loop -- One synthetic SDK queue and causal browser steps are intentionally serial. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
  type Context,
  type FauxProviderHandle,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";

import {
  verifyMutationAttempt,
  type ArcMutationAttempt,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  clientToolHistoryFrom,
  CLIENT_TOOL_RESULT_SIGNAL,
} from "@hashintel/brunch-agent-transport-aisdk";
import {
  generateArcId,
  getArcEndpointKey,
  placeArcEndpoint,
} from "@hashintel/petrinaut-core";

import {
  agentOwnershipHeaders,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";

import type { RootArcExplanation } from "../src/conversation/why.ts";
import type { WorkpieceEvidenceRelation } from "@hashintel/brunch-agent/workpiece";
import type { Browser, Page } from "@playwright/test";

const tool = (name: string, args: Record<string, unknown>, id: string) =>
  fauxAssistantMessage([fauxToolCall(name, args, { id })], {
    stopReason: "toolUse",
  });
const toolOutput = (
  context: Context,
  name: string,
): Record<string, unknown> => {
  const result = context.messages.findLast(
    (message) => message.role === "toolResult" && message.toolName === name,
  );
  assert(result?.role === "toolResult");
  assert.equal(result.isError, false);
  return JSON.parse(
    result.content
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join(""),
  ) as Record<string, unknown>;
};
const quote =
  "When final inspection starts, reserve one available crew until sign-off.";
const inference =
  "Inference: represent that reservation with a standard input arc to the start transition.";
const defaults =
  "Default: no duration is supplied; timing remains unknown, not an invented rate.";
const constraint =
  "Formalism constraint: arc weight denotes a positive token multiplicity.";
const markdown = [
  "# TEST process workpiece",
  "",
  "## Purpose and posture",
  "TEST-authored synthetic control of one crew reservation. No real expert testimony or behavioral acceptance.",
  "",
  "## Operational account",
  quote,
  "",
  "## Construction notes",
  inference,
  defaults,
  constraint,
  "",
  "## Delivery status",
  "Only the prepared root arc is in scope. Prepared surrounding topology remains external; timing and failure behavior are unproved.",
].join("\n");
const locateTexts = [quote, inference, defaults, constraint];
type Span = WorkpieceEvidenceRelation["locator"];
const productLocators = (
  output: Record<string, unknown>,
  subject: "unsettled-candidate" | "current-revision",
) => {
  const lookup = output.locatorLookup as {
    subject: { kind: string; revisionId?: string; ordinal?: number };
    sha256: string;
    queries: {
      text: string;
      occurrences: Span[];
      matchedCount: number;
      omittedCount: number;
    }[];
  };
  assert.equal(lookup.subject.kind, subject);
  if (subject === "unsettled-candidate") {
    assert.equal(lookup.subject.revisionId, undefined);
    assert.equal(lookup.subject.ordinal, undefined);
  }
  assert.deepEqual(
    lookup.queries.map((query) => query.text),
    locateTexts,
  );
  const spans = new Map<string, Span>();
  for (const query of lookup.queries) {
    assert.equal(query.matchedCount, 1);
    assert.equal(query.omittedCount, 0);
    assert.equal(query.occurrences.length, 1);
    const occurrence = query.occurrences[0];
    assert(occurrence);
    spans.set(query.text, occurrence);
  }
  return { lookup, spans };
};
const productSpan = (spans: ReadonlyMap<string, Span>, text: string) => {
  const found = spans.get(text);
  assert(found, "The successful path requires a product-returned locator.");
  return found;
};
const query = {
  transition: "Start final inspection",
  place: "Dispatch crew available",
  arcDirection: "input",
  field: "entity",
};

const storedDocument = async (page: Page) =>
  page.evaluate(() => {
    const store = JSON.parse(
      localStorage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<
      string,
      {
        id: string;
        incarnationId?: string;
        rootArcRequestedBaseHash?: string;
        sdcpn: unknown;
      }
    >;
    const document = Object.values(store).find((entry) =>
      entry.id.endsWith(":root-arc"),
    );
    if (!document?.incarnationId || !document.rootArcRequestedBaseHash)
      throw new Error("Original browser binding missing.");
    const principal = Object.keys(localStorage).find((key) =>
      key.includes("principal"),
    );
    if (!principal) throw new Error("Original principal missing.");
    const raw = localStorage.getItem(principal) ?? "";
    return {
      document,
      principalKey: raw.startsWith('"') ? (JSON.parse(raw) as string) : raw,
    };
  });

const inventory = (definition: unknown) => {
  const entries: { path: string; cosmetic: boolean; kind: string }[] = [];
  const visit = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      if (value.length === 0)
        entries.push({ path, kind: "empty-collection", cosmetic: false });
      value.forEach((entry: unknown, index: number) => {
        if (typeof entry === "object" && entry !== null)
          entries.push({
            path: `${path}/${index}`,
            kind: "entity",
            cosmetic: false,
          });
        visit(entry, `${path}/${index}`);
      });
    } else if (typeof value === "object" && value !== null) {
      for (const [key, child] of Object.entries(value))
        visit(child, `${path}/${key}`);
    } else
      entries.push({ path, kind: "field", cosmetic: /\/(x|y)$/u.test(path) });
  };
  visit(definition, "");
  return entries;
};

export const runReopenedWhyWitness = async ({
  browser,
  origin,
  faux,
  contexts,
  outputDirectory,
  restart,
}: {
  browser: Browser;
  origin: string;
  faux: FauxProviderHandle;
  contexts: Context[];
  outputDirectory: string;
  restart: () => Promise<void>;
}) => {
  const save = (name: string, data: unknown) =>
    writeFileSync(
      join(outputDirectory, `a5-${name}.json`),
      JSON.stringify(data, null, 2),
    );
  save("inventory-rule", {
    frozenBeforeConstruction: true,
    items:
      "Every canonical entity (including arcs) plus every scalar/null field and empty collection, by snapshot-local path. Coordinates x/y excluded from semantic utility but counted. No inferred epochs or continuity.",
    cohorts: {
      prepared:
        "All pre-existing canonical items: external, not conversation-attributed.",
      declared:
        "The created arc and each of its fields: ordinary tracer items, no useful numerator without owner adjudication.",
      absent:
        "Separate fresh bound incarnation with explicitly absent basis, predeclared negative control.",
      temporal:
        "Separate fresh bound incarnation with declared basis but no evidence relations, despite available user text: temporal context is not support.",
      attempts:
        "A pre-existing arc no-op and invalid native weight before construction are never causes; a conflicting delivery after the absent-basis reopen refuses continuation.",
      handEdit:
        "Change the declared cohort's arc weight through the actual properties UI; never attribute it to conversation.",
    },
    utility:
      "Unadjudicated. No genuine Vestera or 100%-utility claim. Supported/retired classes are unearned in this narrow witness.",
  });
  const outcomes: unknown[] = [];
  for (const cohort of ["declared", "absent", "temporal"] as const) {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1100 },
    });
    const blocked: string[] = [];
    const errors: string[] = [];
    await context.route("**/*", async (route) => {
      if (new URL(route.request().url()).origin === origin)
        return route.continue();
      blocked.push(route.request().url());
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(String(error)));
    try {
      faux.setResponses([
        fauxAssistantMessage([
          fauxText(
            "TEST A5 prepared fixture acknowledged; no testimony supplied.",
          ),
        ]),
      ]);
      await page.goto(origin);
      await page.getByRole("button", { name: "Skip tour" }).click();
      await page
        .getByRole("link", {
          name: "Open the prepared root-arc mechanical tracer",
        })
        .click();
      await page
        .getByText(
          "Bound conversation ready. Settle the workpiece before the arc.",
        )
        .waitFor({ timeout: 30_000 });
      const initial = await storedDocument(page);
      const { document } = initial;
      const identity = {
        principalKey: initial.principalKey,
        conversationId: `prepared-root-arc:${document.incarnationId}`,
      };
      const client = createFlueClient({
        url: `${origin}/agents/chat/${flueConversationIdFrom(identity)}`,
        headers: agentOwnershipHeaders(identity),
      });
      const skipTour = page.getByRole("button", { name: "Skip tour" });
      if (await skipTour.isVisible()) await skipTour.click();
      await page
        .getByRole("button", { name: "Show AI assistant", exact: true })
        .click();
      const showChat = async () => {
        if (!(await page.locator("textarea").isVisible()))
          await page
            .getByRole("button", { name: "Show AI assistant", exact: true })
            .click();
      };
      const send = async (body: string, expected: string) => {
        await showChat();
        await page.locator("textarea").fill(body);
        await page.locator("textarea").press("Enter");
        await page
          .getByText(expected, { exact: true })
          .waitFor({ timeout: 30_000 });
      };
      let sourceId = "";
      let basisLocators = new Map<string, Span>();
      let revision: { revisionId: string; sha256: string } | undefined;
      const revisionCallId = `a5-${cohort}-revision`;
      const settledText = `TEST ${cohort}: authorized revision settled, relevance unassessed.`;
      faux.setResponses([
        tool(
          "read_workpiece",
          { markdown, locateTexts },
          `a5-${cohort}-sources`,
        ),
        (modelContext) => {
          const output = toolOutput(modelContext, "read_workpiece");
          assert(Array.isArray(output.sources));
          const source = output.sources.find(
            (value: unknown) =>
              typeof value === "object" &&
              value !== null &&
              "text" in value &&
              value.text === `TEST scripted user evidence: ${quote}`,
          ) as { id: string } | undefined;
          assert(
            source,
            "The model-facing source discovery path must provide the actual source ID.",
          );
          sourceId = source.id;
          const candidate = productLocators(output, "unsettled-candidate");
          assert.equal(
            output.currentWorkpiece,
            null,
            "Candidate lookup does not settle state.",
          );
          return tool(
            "mutate_workpiece",
            {
              markdown,
              evidence:
                cohort === "temporal"
                  ? undefined
                  : [
                      {
                        locator: productSpan(candidate.spans, quote),
                        messageIds: [sourceId],
                        kind: "elicited",
                      },
                      {
                        locator: productSpan(candidate.spans, inference),
                        messageIds: [],
                        kind: "inference",
                      },
                      {
                        locator: productSpan(candidate.spans, defaults),
                        messageIds: [],
                        kind: "default",
                      },
                      {
                        locator: productSpan(candidate.spans, constraint),
                        messageIds: [],
                        kind: "formalism-constraint",
                      },
                    ],
            },
            revisionCallId,
          );
        },
        (modelContext) => {
          const pointer = toolOutput(modelContext, "mutate_workpiece");
          assert.equal(pointer.revisionId, revisionCallId);
          assert.equal(typeof pointer.sha256, "string");
          revision = {
            revisionId: revisionCallId,
            sha256: pointer.sha256 as string,
          };
          return tool(
            "read_workpiece",
            { locateTexts },
            `a5-${cohort}-current`,
          );
        },
        (modelContext) => {
          const result = toolOutput(modelContext, "read_workpiece");
          const settled = productLocators(result, "current-revision");
          assert.equal(settled.lookup.subject.revisionId, revision?.revisionId);
          assert.equal(settled.lookup.sha256, revision?.sha256);
          basisLocators = settled.spans;
          return fauxAssistantMessage([fauxText(settledText)]);
        },
      ]);
      await send(`TEST scripted user evidence: ${quote}`, settledText);
      assert(revision);
      assert.equal(
        await page.getByTestId("brunch-current-workpiece").innerText(),
        markdown,
      );
      save(`${cohort}-canonical-pre`, document.sdcpn);
      await page.screenshot({
        path: join(outputDirectory, `a5-${cohort}-workpiece.png`),
        fullPage: true,
      });
      const arc = {
        transitionId: "start-final-inspection",
        placeId: "dispatch-crew-available",
        arcDirection: "input",
        weight: "1",
        type: "standard",
        brunch: {
          requestedBaseHash: document.rootArcRequestedBaseHash,
          basis:
            cohort === "absent"
              ? {
                  kind: "absent",
                  reason: "TEST predeclared basis-absent control.",
                }
              : {
                  kind: "declared",
                  ...revision,
                  scope: "operation",
                  rationale:
                    "TEST declared representation: reserve one available crew via this standard input arc; surrounding topology is prepared external material.",
                  locators: locateTexts.map((text) =>
                    productSpan(basisLocators, text),
                  ),
                },
        },
      };
      if (cohort === "declared") {
        faux.setResponses([
          tool("addArc", { ...arc, placeId: "batch-ready" }, "a5-no-op"),
          fauxAssistantMessage([
            fauxText("TEST existing arc was a recorded no-op, not a cause."),
          ]),
        ]);
        await send(
          "TEST predeclared no-op control: the existing batch input arc already exists.",
          "TEST existing arc was a recorded no-op, not a cause.",
        );
        const noOp = clientToolHistoryFrom(
          (await client.history()).messages,
        ).results.find((result) => result.toolCallId === "a5-no-op");
        assert(noOp, "The actual no-op must deliver its browser record.");
        assert.equal(
          (noOp.metadata as { mutationRecord: { outcome: string } })
            .mutationRecord.outcome,
          "no-op",
        );
        save("no-op-result", noOp);
        faux.setResponses([
          tool("addArc", { ...arc, weight: true }, "a5-invalid-weight"),
          fauxAssistantMessage([
            fauxText(
              "TEST invalid weight failed native validation without a browser effect.",
            ),
          ]),
        ]);
        await send(
          "TEST predeclared failed validation control: boolean weight.",
          "TEST invalid weight failed native validation without a browser effect.",
        );
        assert(
          !clientToolHistoryFrom(
            (await client.history()).messages,
          ).results.some((result) => result.toolCallId === "a5-invalid-weight"),
        );
      }
      faux.setResponses([
        tool("getLatestNetDefinition", {}, `a5-${cohort}-read-before`),
        tool("addArc", arc, `a5-${cohort}-arc`),
        fauxAssistantMessage([
          fauxText(`TEST ${cohort}: verified browser result received once.`),
        ]),
      ]);
      const beforeMutation = contexts.length;
      await send(
        "TEST apply the one bound root arc with the settled basis and issued base.",
        `TEST ${cohort}: verified browser result received once.`,
      );
      assert.equal(contexts.length - beforeMutation, 3);
      const history = await client.history();
      const results = clientToolHistoryFrom(history.messages).results;
      const browserResult = results.find(
        (result) => result.toolCallId === `a5-${cohort}-arc`,
      );
      assert(browserResult);
      const metadata = browserResult.metadata as {
        mutationRecord: { attempts: ArcMutationAttempt[] };
      };
      const actualAttempt = metadata.mutationRecord.attempts[0];
      assert(actualAttempt);
      await verifyMutationAttempt(actualAttempt);
      assert.equal(actualAttempt.outcome, "applied");
      save(`${cohort}-mutation-record`, browserResult);
      const post = (await storedDocument(page)).document.sdcpn;
      save(`${cohort}-canonical-post`, post);
      const createdPath = actualAttempt.effects.created[0]?.path;
      assert(createdPath);
      save(
        `${cohort}-inventory`,
        inventory(post).map((entry) => ({
          ...entry,
          cohort:
            entry.path === createdPath ||
            entry.path.startsWith(`${createdPath}/`)
              ? cohort
              : "prepared",
          disposition:
            entry.path === createdPath ||
            entry.path.startsWith(`${createdPath}/`)
              ? cohort === "absent"
                ? "basis-absent"
                : "partially-supported"
              : "external",
          useful: null,
        })),
      );
      const whyAnswers: RootArcExplanation[] = [];
      let sequence = 0;
      const askWhy = async (
        mode: "live" | "as-of",
        expectedDisposition: RootArcExplanation["disposition"],
        extra: Record<string, unknown> = {},
      ) => {
        sequence += 1;
        const readId = `a5-${cohort}-live-${sequence}`;
        const expected = `TEST assistant interpretation ${cohort}-${sequence}: ${expectedDisposition}; source relevance and template completeness remain unassessed.`;
        faux.setResponses([
          ...(mode === "live"
            ? [tool("getLatestNetDefinition", {}, readId)]
            : []),
          tool(
            "query_workpiece",
            {
              ...query,
              ...extra,
              ...(mode === "live" ? { observationToolCallId: readId } : {}),
            },
            `a5-${cohort}-why-${sequence}`,
          ),
          (modelContext) => {
            const answer = toolOutput(
              modelContext,
              "query_workpiece",
            ) as unknown as RootArcExplanation;
            assert.equal(
              answer.disposition,
              expectedDisposition,
              answer.reason,
            );
            if (expectedDisposition === "partially-supported") {
              assert.equal(answer.governing?.revisionId, revisionCallId);
              if (cohort === "temporal") {
                assert(
                  answer.governing.passages.every(
                    (passage) =>
                      passage.standing === "temporal-context-only" &&
                      passage.relations.length === 0,
                  ),
                );
              } else {
                assert.equal(
                  answer.governing.passages[0]?.relations[0]?.sources[0]?.id,
                  sourceId,
                );
                assert.deepEqual(
                  answer.governing.passages.map(
                    (passage) => passage.relations[0]?.kind,
                  ),
                  ["elicited", "inference", "default", "formalism-constraint"],
                );
              }
              assert.equal(answer.governing.passages[0]?.text, quote);
              if (answer.reconciliation.status === "serialization-equivalent") {
                assert.equal(mode, "live");
                assert.equal(
                  answer.reconciliation.observationScope,
                  "live-observed",
                );
                assert.notEqual(
                  answer.reconciliation.sha256,
                  answer.reconciliation.recordedSha256,
                );
                assert.equal(
                  answer.reconciliation.recordedToolCallId,
                  `a5-${cohort}-arc`,
                );
              } else
                assert.equal(
                  answer.reconciliation.status,
                  mode === "live" ? "live-observed" : "as-of",
                );
            }
            whyAnswers.push(answer);
            return fauxAssistantMessage([
              fauxText(
                `${expected}\n${answer.governing ? `Governing revision ${answer.governing.revisionId} (${answer.governing.status}): ${answer.governing.passages[0]?.text}\n${answer.governing.passages.some((passage) => passage.relations.some((relation) => relation.kind === "elicited")) ? "Declared elicited support is distinct from constructor inference, default and formalism constraints." : "No evidence relation was declared: the passage is temporal context, not elicited support."} ` : ""}${answer.reason}`,
              ),
            ]);
          },
        ]);
        await showChat();
        await page
          .locator("textarea")
          .fill(
            `TEST why does the crew input arc exist? Query ${cohort}-${sequence}.`,
          );
        await page.locator("textarea").press("Enter");
        const interpretation = page
          .getByText(expected, { exact: false })
          .last();
        await interpretation.waitFor({ timeout: 30_000 });
        await interpretation.scrollIntoViewIfNeeded();
        const outputText = await page
          .getByTestId("brunch-why-output")
          .innerText();
        assert.deepEqual(JSON.parse(outputText), whyAnswers.at(-1));
        save(
          `${cohort}-dom-${sequence}`,
          await page.locator("body").innerText(),
        );
        await page.screenshot({
          path: join(outputDirectory, `a5-${cohort}-why-${sequence}.png`),
          fullPage: true,
        });
      };
      await askWhy(
        "live",
        cohort === "absent" ? "basis-absent" : "partially-supported",
      );
      const beforeRestart = await client.history();
      const beforeReopenCalls = contexts.length;
      await restart();
      await page.reload();
      await page.getByTestId("brunch-why-output").waitFor({ timeout: 30_000 });
      assert.equal(
        contexts.length,
        beforeReopenCalls,
        "Reload must not invoke the model or reapply the arc.",
      );
      assert.deepEqual((await storedDocument(page)).document.sdcpn, post);
      const reopenedHistory = await client.history();
      assert.equal(
        reopenedHistory.conversationId,
        beforeRestart.conversationId,
      );
      assert.deepEqual(reopenedHistory.messages, beforeRestart.messages);
      await askWhy(
        "live",
        cohort === "absent" ? "basis-absent" : "partially-supported",
      );
      if (cohort === "declared") {
        await askWhy("live", "external", { place: "Batch ready" });
        assert.equal(whyAnswers.at(-1)?.recordedChange, undefined);
        assert(
          whyAnswers
            .at(-1)
            ?.attempts.some(
              (attempt) =>
                attempt.toolCallId === "a5-no-op" &&
                attempt.outcome === "no-op",
            ),
        );
        await askWhy("live", "refused", { transition: "unknown endpoint" });
        await askWhy("as-of", "partially-supported", { field: "weight" });
        await askWhy("live", "partially-supported", { field: "placeId" });
        assert.equal(
          whyAnswers.at(-1)?.target?.value,
          "dispatch-crew-available",
        );
        await askWhy("live", "partially-supported", { field: "type" });
        assert.equal(whyAnswers.at(-1)?.target?.value, "standard");
        faux.setResponses([
          tool(
            "mutate_workpiece",
            { markdown: `${markdown}\n\nUnrelated context remains unrelated.` },
            "a5-carried-revision",
          ),
          fauxAssistantMessage([
            fauxText("TEST carried unchanged passage without new evidence."),
          ]),
        ]);
        await send(
          "TEST append unrelated context, carry unchanged passage relations only.",
          "TEST carried unchanged passage without new evidence.",
        );
        await askWhy("live", "partially-supported");
        assert.equal(whyAnswers.at(-1)?.governing?.status, "superseded");
        // The public selection URL opens the real properties panel; only its UI mutates.
        const selection = new URL(page.url());
        selection.searchParams.set("itemType", "arc");
        selection.searchParams.set(
          "itemId",
          generateArcId({
            inputId: getArcEndpointKey(
              placeArcEndpoint("dispatch-crew-available"),
            ),
            outputId: "start-final-inspection",
          }),
        );
        await page.goto(selection.href);
        const weight = page.getByRole("spinbutton");
        await weight.fill("2");
        await weight.press("Tab");
        await page.getByText(/Live document hash differs/).waitFor();
        await page.screenshot({
          path: join(outputDirectory, "a5-hand-edit-properties.png"),
          fullPage: true,
        });
        selection.searchParams.delete("itemType");
        selection.searchParams.delete("itemId");
        await page.goto(selection.href);
        await askWhy("live", "external");
        assert.equal(whyAnswers.at(-1)?.recordedChange, undefined);
        const handEdited = (await storedDocument(page)).document.sdcpn;
        save("hand-edit-canonical", handEdited);
        save(
          "hand-edit-inventory",
          inventory(handEdited).map((entry) => ({
            ...entry,
            cohort:
              entry.path === `${createdPath}/weight`
                ? "hand-edit-control"
                : entry.path === createdPath ||
                    entry.path.startsWith(`${createdPath}/`)
                  ? "declared"
                  : "prepared",
            disposition: "external",
            useful: null,
            reason:
              "Current whole-definition reconciliation refuses unrecorded content. Unchanged ordinary fields are not relabelled as deliberate controls.",
          })),
        );
      }
      if (cohort === "absent") {
        const beforeConflict = contexts.length;
        const receipt = await client.send({
          message: {
            kind: "signal",
            type: CLIENT_TOOL_RESULT_SIGNAL,
            tagName: CLIENT_TOOL_RESULT_SIGNAL,
            body: JSON.stringify([
              {
                ...browserResult,
                output: {
                  applied: false,
                  reason: "TEST contradictory delivery control",
                },
              },
            ]),
          },
        });
        await assert.rejects(client.wait(receipt));
        assert.equal(
          contexts.length,
          beforeConflict,
          "A conflicting result cannot continue the model.",
        );
        await askWhy("live", "refused");
      }
      const wrongOwner = await fetch(
        `${origin}/agents/chat/${flueConversationIdFrom(identity)}/history`,
        {
          headers: agentOwnershipHeaders({
            ...identity,
            principalKey: "TEST-wrong-owner",
          }),
        },
      );
      assert.equal(wrongOwner.status, 403);
      save(`${cohort}-history`, await client.history());
      save(`${cohort}-why-results`, whyAnswers);
      assert.deepEqual(blocked, []);
      assert.deepEqual(errors, []);
      outcomes.push({
        cohort,
        identity,
        binding: actualAttempt.binding,
        conversationId: reopenedHistory.conversationId,
        sourceId,
        whyAnswers: whyAnswers.length,
        reopenedSameStore: true,
        runtimeRestarted: true,
        browserReloaded: true,
        secondProcessRestart: false,
        errors,
        blocked,
      });
    } catch (error) {
      save(`${cohort}-failure`, {
        error: String(error),
        errors,
        blocked,
        dom: await page.locator("body").innerText(),
      });
      await page.screenshot({
        path: join(outputDirectory, `a5-${cohort}-failure.png`),
        fullPage: true,
      });
      throw error;
    } finally {
      await context.close();
    }
  }
  save("observations", {
    outcomes,
    paidCalls: 0,
    claim:
      "Synthetic-control product wiring and interpretation only. Not genuine testimony, real-model fidelity, Lu utility adjudication, Step A acceptance, or Step B.",
    recoveryIntegrationRecheckRequired: true,
  });
};
