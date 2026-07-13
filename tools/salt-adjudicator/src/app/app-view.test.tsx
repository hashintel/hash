import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { describe, expect, test, vi } from "vitest";

import {
  type Card,
  type QualificationCard,
  createStudy,
  createSwipeEvent,
  swipesToJsonl,
} from "../core.ts";
import {
  type EmbeddedPayload,
  type GenericEmbeddedPayload,
  buildStudyHtml,
  useAppController,
} from "./app-controller.ts";
import { AppView } from "./app-view.tsx";
import { RelationCardContent } from "./app-view/shared/relation-card-content.tsx";

const makeStudyPayload = (
  cardCount = 2,
  qualificationCards: QualificationCard[] = [],
): GenericEmbeddedPayload => {
  const cards: Card[] = Array.from({ length: cardCount }, (_, cardIndex) => ({
    relation_id: `R${cardIndex + 1}`,
    family_id: `F${cardIndex + 1}`,
    card_text: [
      `Relation: synthetic ${cardIndex + 1}`,
      `Description: synthetic relation ${cardIndex + 1}`,
      "Inverse Name: none recorded",
      "",
      "Constraints:",
      "  - direction: source -> target",
      "",
      "Examples:",
      `  - example: source ${cardIndex + 1} -> target ${cardIndex + 1}`,
      "",
      `Slug: synthetic-${cardIndex + 1}`,
      "",
    ].join("\n"),
    card_hash: `hash-${cardIndex + 1}`,
    prescreen: cardIndex === 0 ? "equivalence" : "normal",
  }));
  const { study, codeSheet } = createStudy({
    cards,
    qualificationCards,
    annotatorIds: ["DEMO"],
    seed: "preact-test",
    coverageTarget: 1,
    sliceSize: cards.length,
    rubricVersion: "test-v1",
    title: "Preact test study",
  });
  const code = codeSheet[0]?.code;
  if (!code) {
    throw new Error("The test study did not generate an access code.");
  }
  return {
    kind: "generic",
    demo_study: study,
    demo_code: code,
  };
};

const TestApplication = ({ payload }: { payload: EmbeddedPayload }) => {
  const controller = useAppController(payload, vi.fn());
  return <AppView controller={controller} />;
};

const savedSession = () => {
  const sessionKey = [...Array(localStorage.length).keys()]
    .map((storageIndex) => localStorage.key(storageIndex))
    .find((key) => key?.startsWith("salt:session:"));
  if (!sessionKey) {
    throw new Error("No crash-safe session was stored.");
  }
  return JSON.parse(localStorage.getItem(sessionKey) ?? "null") as {
    annotator_id: string;
    events: Array<{
      event_type: string;
      swipe?: {
        label?: string;
        latency_ms?: number;
        note?: string | null;
      };
    }>;
  };
};

const sessionStorageKey = (payload: GenericEmbeddedPayload): string =>
  `salt:session:${payload.demo_study.study_id}:${payload.demo_study.deck_hash}:DEMO`;

const makeBuilderCards = (count = 14): Card[] =>
  Array.from({ length: count }, (_, cardIndex) => ({
    relation_id: `POOL-${String(cardIndex + 1).padStart(2, "0")}`,
    family_id: `POOL-F${Math.floor(cardIndex / 2)}`,
    card_text: [
      `Relation: pool relation ${cardIndex + 1}`,
      `Description: candidate relation ${cardIndex + 1}`,
      "",
      "Examples:",
      `  - source ${cardIndex + 1} -> target ${cardIndex + 1}`,
    ].join("\n"),
    card_hash: `pool-hash-${cardIndex + 1}`,
    prescreen: cardIndex < 3 ? "equivalence" : "normal",
  }));

const importBuilderPool = async (cards = makeBuilderCards()) => {
  fireEvent.click(screen.getByRole("button", { name: "Build a study" }));
  const file = new File(
    [cards.map((card) => JSON.stringify(card)).join("\n")],
    "candidate-pool.jsonl",
    { type: "application/x-ndjson" },
  );
  fireEvent.change(screen.getByLabelText(/Source card pool · JSONL/u), {
    target: { files: [file] },
  });
  await waitFor(() => expect(screen.getByText("Pool accepted")).toBeTruthy());
  return cards;
};

describe("Preact application", () => {
  test("renders canonical Wikidata sections as a relation document", () => {
    render(
      <RelationCardContent
        headingLevel="h1"
        cardText={[
          "Relation: head of government",
          "Description: head of the executive power",
          "Aliases:",
          "  - mayor",
          "  - prime minister",
          "",
          "Inverse Name: government headed by",
          "",
          "Source types:",
          "  - country (sovereign state)",
          "",
          "Target types:",
          "  - human (member of Homo sapiens)",
          "",
          "Constraints:",
          "  - symmetric? no",
          "  - direction: source -> target",
          "",
          "Examples:",
          "  - country: Germany -> Friedrich Merz",
          "",
          "Slug: head-of-government",
        ].join("\n")}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "head of government", level: 1 }),
    ).toBeTruthy();
    expect(screen.getByText("head of the executive power")).toBeTruthy();
    expect(screen.getByText("Germany")).toBeTruthy();
    expect(screen.getByText("Friedrich Merz")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Source types" })).toBeNull();
    expect(screen.queryByText("head-of-government")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Details" }));

    expect(screen.getByRole("heading", { name: "Source types" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Target types" })).toBeTruthy();
    expect(screen.getByText("symmetric?")).toBeTruthy();
    expect(screen.getByText("no")).toBeTruthy();
    expect(screen.queryByText("head-of-government")).toBeNull();
  });

  test("navigates public modes through component handlers", () => {
    render(<TestApplication payload={makeStudyPayload()} />);

    fireEvent.click(screen.getByRole("button", { name: "Build a study" }));

    expect(
      screen.getByRole("heading", {
        name: "Build one reproducible study bundle.",
      }),
    ).toBeTruthy();
  });

  test("introduces the map task before code entry", () => {
    const payload = makeStudyPayload();
    render(
      <TestApplication
        payload={{ kind: "study", study: payload.demo_study }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "What you're doing" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        '"If A and B are connected by this kind of link, where should B be relative to A on the map?"',
      ),
    ).toBeTruthy();
    expect(document.querySelector(".intro-labels")?.textContent).toContain(
      'Same dot — they are the same thing, recorded twice. ("duplicate of")',
    );
    expect(screen.getByText(/calibration, not a test/u)).toBeTruthy();
    expect(screen.getByLabelText("Annotator code")).toBeTruthy();
  });

  test("imports, searches, edits, and removes qualification anchors", async () => {
    render(<TestApplication payload={makeStudyPayload()} />);
    await importBuilderPool();

    expect(screen.getByText("14")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("11")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Curate qualification anchors",
      }),
    );

    const searchInput = screen.getByLabelText(/Search 14 cards/u);
    fireEvent.input(searchInput, { target: { value: "POOL-14" } });
    fireEvent.click(
      screen.getByRole("button", { name: /POOL-14.*pool relation 14/u }),
    );
    expect(screen.getByText(/Relation: pool relation 14/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: /O · Just a line/u }));
    fireEvent.input(screen.getByLabelText("Required rationale"), {
      target: {
        value:
          "The source and target remain distinct roles across this relation.",
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Add qualification anchor" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Update anchor" }),
      ).toBeTruthy(),
    );
    fireEvent.input(searchInput, { target: { value: "" } });
    fireEvent.click(screen.getByLabelText("Show anchors only"));
    expect(
      screen.queryByRole("button", {
        name: /POOL-01.*pool relation 1.*Open/u,
      }),
    ).toBeNull();
    expect(
      screen.getByRole("button", {
        name: /POOL-14.*pool relation 14.*O anchor/u,
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Show anchors only"));

    fireEvent.input(screen.getByLabelText("Required rationale"), {
      target: {
        value:
          "The roles remain distinct, with evidence connecting source to target.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update anchor" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove anchor" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Add qualification anchor",
        }),
      ).toBeTruthy(),
    );
    expect(document.querySelector(".anchor-readout strong")?.textContent).toBe(
      "0",
    );
  });

  test("switches planning modes, blocks infeasible plans, and generates an exact subset", async () => {
    render(<TestApplication payload={makeStudyPayload()} />);
    await importBuilderPool();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Curate qualification anchors",
      }),
    );

    fireEvent.click(screen.getByRole("radio", { name: /C · Same dot/u }));
    fireEvent.input(screen.getByLabelText("Required rationale"), {
      target: {
        value:
          "Both sides denote the same canonical point in this reference case.",
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Add qualification anchor" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to planning" }),
    );

    const rosterInput = screen.getByLabelText(/Annotator IDs/u);
    fireEvent.input(rosterInput, {
      target: { value: "annotator-01\nannotator-02" },
    });
    expect(
      screen.getByText(/Coverage 3× requires at least 3 annotators/u),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Review this plan",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    fireEvent.input(rosterInput, {
      target: {
        value: "annotator-01\nannotator-02\nannotator-03",
      },
    });
    fireEvent.click(screen.getByRole("radio", { name: /Exact sample first/u }));
    fireEvent.input(screen.getByLabelText(/Exact production sample/u), {
      target: { value: "6" },
    });
    fireEvent.input(screen.getByLabelText(/Production cards \/ annotator/u), {
      target: { value: "6" },
    });

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "6 cards · 3×" }),
      ).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review this plan" }));
    expect(
      screen.getByRole("heading", {
        name: "Confirm the reproducible study.",
      }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Generate study bundle" }),
    );
    await waitFor(() =>
      expect(screen.getByText("Step 5 · bundle ready")).toBeTruthy(),
    );
    expect(
      screen.getByText("Production cards").parentElement?.textContent,
    ).toBe("Production cards6");
    expect(
      screen.getByText("Qualification cards").parentElement?.textContent,
    ).toBe("Qualification cards1");
    expect(screen.getByText("Source pool").parentElement?.textContent).toBe(
      "Source pool14",
    );
  });

  test("opens the advertised demo path with Enter", () => {
    render(<TestApplication payload={makeStudyPayload()} />);

    fireEvent.keyDown(document, { key: "Enter" });

    expect(
      screen.getByRole("region", { name: "Current relation" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: "A is the first item. It points through this relation to B, the second item.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("Where should B sit relative to A on the map?"),
    ).toBeTruthy();
  });

  test("toggles card details with D and collapses them on advance", async () => {
    render(<TestApplication payload={makeStudyPayload()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Open the demo deck/u }),
    );

    expect(screen.queryByRole("heading", { name: "Constraints" })).toBeNull();
    fireEvent.keyDown(document, { key: "d" });
    expect(screen.getByRole("heading", { name: "Constraints" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Hide details D/u }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: /Same dot, like duplicate of, up, C/u,
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Details D/u })).toBeTruthy(),
    );
    expect(screen.queryByRole("heading", { name: "Constraints" })).toBeNull();
  });

  test("serializes a clean DOM-created boot subtree for study exports", () => {
    const payload = makeStudyPayload();
    const appElement = document.createElement("div");
    appElement.id = "app";
    appElement.textContent = "stale application";
    const liveRegion = document.createElement("div");
    liveRegion.id = "live-region";
    liveRegion.textContent = "stale announcement";
    const payloadElement = document.createElement("script");
    payloadElement.id = "salt-study";
    payloadElement.type = "application/json";
    document.body.append(appElement, liveRegion, payloadElement);

    const exportedHtml = buildStudyHtml(payload.demo_study);

    expect(exportedHtml).toContain("SALT is loading…");
    expect(exportedHtml).not.toContain("stale application");
    expect(exportedHtml).not.toContain("stale announcement");
    expect(exportedHtml).toContain('"kind":"study"');
    appElement.remove();
    liveRegion.remove();
    payloadElement.remove();
  });

  test("persists a decision synchronously before publishing the next card", () => {
    render(<TestApplication payload={makeStudyPayload()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Open the demo deck/u }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Same dot, like duplicate of, up, C/u,
      }),
    );

    expect(savedSession().events[0]?.swipe?.label).toBe("C");
  });

  test("keeps a controlled note through scoped keyboard shortcuts", () => {
    render(<TestApplication payload={makeStudyPayload()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Open the demo deck/u }),
    );

    fireEvent.keyDown(document, { key: "n" });
    const noteInput = screen.getByPlaceholderText(
      "One line of context for downstream review",
    );
    fireEvent.input(noteInput, {
      target: { value: "Downstream context" },
    });
    fireEvent.keyDown(noteInput, { key: "Enter" });
    fireEvent.keyDown(document, { key: "c" });

    expect(savedSession().events[0]?.swipe?.note).toBe("Downstream context");
  });

  test("blocks further decisions when synchronous persistence fails", () => {
    render(<TestApplication payload={makeStudyPayload()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Open the demo deck/u }),
    );
    const setItemMock = vi
      .spyOn(localStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("quota exceeded");
      });

    fireEvent.click(
      screen.getByRole("button", {
        name: /Same dot, like duplicate of, up, C/u,
      }),
    );
    setItemMock.mockRestore();

    expect(screen.getByRole("alert").textContent).toContain(
      "Persistence stopped",
    );
  });

  test("requires a 56px swipe and reserves vertical touch for scrolling", () => {
    render(<TestApplication payload={makeStudyPayload()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Open the demo deck/u }),
    );
    const card = document.querySelector<HTMLElement>("[data-swipe-card]");
    expect(card).toBeTruthy();
    if (!card) {
      return;
    }

    fireEvent.pointerDown(card, {
      pointerId: 7,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerUp(card, {
      pointerId: 7,
      clientX: 155,
      clientY: 100,
    });
    expect(savedSession().events).toHaveLength(0);

    fireEvent.pointerDown(card, {
      pointerId: 8,
      pointerType: "touch",
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerUp(card, {
      pointerId: 8,
      pointerType: "touch",
      clientX: 100,
      clientY: 170,
    });
    expect(savedSession().events).toHaveLength(0);

    fireEvent.pointerDown(card, {
      pointerId: 9,
      pointerType: "touch",
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerUp(card, {
      pointerId: 9,
      pointerType: "touch",
      clientX: 156,
      clientY: 100,
    });
    expect(savedSession().events[0]?.swipe?.label).toBe("P");
  });

  test("does not overwrite an invalid crash-safe session", () => {
    const payload = makeStudyPayload();
    const key = sessionStorageKey(payload);
    const corruptedSession = JSON.stringify({
      snapshot_version: 1,
      study_id: payload.demo_study.study_id,
    });
    localStorage.setItem(key, corruptedSession);

    render(<TestApplication payload={payload} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Open the demo deck/u }),
    );

    expect(
      screen.getByRole("heading", {
        name: "Evidence cannot be collected in this state.",
      }),
    ).toBeTruthy();
    expect(screen.getByText(/session contract/u).textContent).toContain(
      '"deck_hash"',
    );
    expect(localStorage.getItem(key)).toBe(corruptedSession);
  });

  test("resumes evidence and requires confirmation before a clean restart", () => {
    const payload = makeStudyPayload();
    const firstRender = render(<TestApplication payload={payload} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Open the demo deck/u }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /Same dot, like duplicate of, up, C/u,
      }),
    );
    expect(savedSession().events).toHaveLength(1);
    firstRender.unmount();

    const resumeRender = render(<TestApplication payload={payload} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Open the demo deck/u }),
    );
    expect(screen.getByRole("heading", { name: "Resume DEMO?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resume session" }));
    expect(savedSession().events).toHaveLength(1);
    resumeRender.unmount();

    render(<TestApplication payload={payload} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Open the demo deck/u }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Start clean" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "deletes the browser's crash buffer",
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete and restart" }));
    expect(savedSession().events).toHaveLength(0);
  });

  test("excludes class-guide and rubric-dialog time from latency", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    render(<TestApplication payload={makeStudyPayload()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Open the demo deck/u }),
    );

    now = 100;
    fireEvent.click(screen.getByRole("button", { name: /Class guide/u }));
    now = 1_100;
    fireEvent.click(screen.getByRole("button", { name: /Close Esc/u }));

    now = 1_200;
    fireEvent.click(screen.getByRole("button", { name: /Rubric test-v1/u }));
    now = 2_200;
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    now = 2_300;
    fireEvent.click(
      screen.getByRole("button", {
        name: /Same dot, like duplicate of, up, C/u,
      }),
    );

    expect(savedSession().events[0]?.swipe?.latency_ms).toBe(300);
  });

  test("blocks decisions while a reference dialog is open", () => {
    render(<TestApplication payload={makeStudyPayload()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Open the demo deck/u }),
    );
    const coincidentButton = screen.getByRole("button", {
      name: /Same dot, like duplicate of, up, C/u,
    });

    fireEvent.click(screen.getByRole("button", { name: /Class guide/u }));
    fireEvent.click(coincidentButton);
    expect(savedSession().events).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /Close Esc/u }));

    fireEvent.click(screen.getByRole("button", { name: /Rubric test-v1/u }));
    fireEvent.click(coincidentButton);
    expect(savedSession().events).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(coincidentButton);
    expect(savedSession().events).toHaveLength(1);
  });

  test("undo appends a retraction and re-queues the card", async () => {
    render(<TestApplication payload={makeStudyPayload()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Open the demo deck/u }),
    );
    const firstRelation = document.querySelector(
      "[data-swipe-card] .card-meta span",
    )?.textContent;
    expect(firstRelation).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: /Same dot, like duplicate of, up, C/u,
      }),
    );
    await waitFor(() => {
      expect(
        document.querySelector("[data-swipe-card] .card-meta span")
          ?.textContent,
      ).not.toBe(firstRelation);
    });
    fireEvent.click(screen.getByRole("button", { name: /Z Undo/u }));

    expect(savedSession().events.map((event) => event.event_type)).toEqual([
      "swipe",
      "retraction",
    ]);
    expect(
      document.querySelector("[data-swipe-card] .card-meta span")?.textContent,
    ).toBe(firstRelation);
  });

  test("keeps qualification answers blind until the full deck is complete", async () => {
    const rationale =
      "This anchor is coincident because both sides name one canonical target.";
    const qualificationCard: QualificationCard = {
      relation_id: "QUAL-1",
      family_id: "qualification",
      card_text: "Relation: exact match\nExample one\nExample two",
      card_hash: "qualification-hash-1",
      prescreen: "equivalence",
      answer: "C",
      rationale,
    };
    render(
      <TestApplication payload={makeStudyPayload(2, [qualificationCard])} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Open the demo deck/u }),
    );

    expect(screen.queryByText(rationale)).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Nearby, like part of, right, P/u,
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "1 anchor to review." }),
      ).toBeTruthy(),
    );
    expect(screen.getByText(rationale)).toBeTruthy();
    expect(screen.getByText(/C · Same dot/u)).toBeTruthy();
  });

  test("updates merged file sources without mutating sibling entries", async () => {
    const payload = makeStudyPayload();
    const card = payload.demo_study.cards[0];
    if (!card) {
      throw new Error("The merge test requires one production card.");
    }
    const makeSwipeFile = (
      filename: string,
      annotatorId: string,
      label: "C" | "P",
      timestampMs: number,
    ): File => {
      const event = createSwipeEvent({
        study: payload.demo_study,
        annotatorId,
        card,
        pass: 1,
        label,
        latencyMs: 100,
        flagged: false,
        note: null,
        rubricVersion: payload.demo_study.rubric_version,
        qualification: false,
        sessionId: `session-${annotatorId}`,
        sequence: 1,
        timestamp: {
          timestampMs,
          iso: new Date(timestampMs).toISOString(),
        },
      });
      return new File([swipesToJsonl([event])], filename, {
        type: "application/x-ndjson",
      });
    };

    render(<TestApplication payload={payload} />);
    const mergeButton = screen.getAllByRole("button", {
      name: "Merge exports",
    })[0];
    if (!mergeButton) {
      throw new Error("The merge navigation control is missing.");
    }
    fireEvent.click(mergeButton);
    fireEvent.change(screen.getByLabelText(/Swipes JSONL · choose multiple/u), {
      target: {
        files: [
          makeSwipeFile("alpha.jsonl", "annotator-a", "C", 1_700_000_000_000),
          makeSwipeFile("beta.jsonl", "annotator-b", "P", 1_700_000_000_001),
        ],
      },
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Remove alpha.jsonl" }),
      ).toBeTruthy(),
    );
    expect(
      screen.getByRole("button", { name: "Remove beta.jsonl" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Cross-annotator distributions" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove alpha.jsonl" }));
    expect(
      screen.queryByRole("button", { name: "Remove alpha.jsonl" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Remove beta.jsonl" }),
    ).toBeTruthy();
  });
});
