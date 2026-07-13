import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, test, vi } from "vitest";

import { type Card, createStudy } from "../core.ts";
import {
  type GenericEmbeddedPayload,
  buildStudyHtml,
  useAppController,
} from "./app-controller.ts";
import { AppView } from "./app-view.tsx";

const makeStudyPayload = (cardCount = 2): GenericEmbeddedPayload => {
  const cards: Card[] = Array.from({ length: cardCount }, (_, cardIndex) => ({
    relation_id: `R${cardIndex + 1}`,
    family_id: `F${cardIndex + 1}`,
    card_text: `Relation: synthetic ${cardIndex + 1}\nExample A\nExample B`,
    card_hash: `hash-${cardIndex + 1}`,
    prescreen: cardIndex === 0 ? "equivalence" : "normal",
  }));
  const { study, codeSheet } = createStudy({
    cards,
    qualificationCards: [],
    annotatorIds: ["DEMO"],
    seed: "preact-test",
    coverageTarget: 1,
    sliceSize: cards.length,
    rubricVersion: "test-v1",
    coincidentTarget: 1,
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

const TestApplication = ({ payload }: { payload: GenericEmbeddedPayload }) => {
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
    events: Array<{
      swipe?: { label?: string; note?: string | null };
    }>;
  };
};

describe("Preact application", () => {
  test("navigates public modes through component handlers", () => {
    render(<TestApplication payload={makeStudyPayload()} />);

    fireEvent.click(screen.getByRole("button", { name: "Build a study" }));

    expect(
      screen.getByRole("heading", {
        name: "Build one reproducible study bundle.",
      }),
    ).toBeTruthy();
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
        name: /Coincident, up, C/u,
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
        name: /Coincident, up, C/u,
      }),
    );
    setItemMock.mockRestore();

    expect(screen.getByRole("alert").textContent).toContain(
      "Persistence stopped",
    );
  });

  test("requires a 56px pointer swipe", () => {
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
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerUp(card, {
      pointerId: 8,
      clientX: 156,
      clientY: 100,
    });
    expect(savedSession().events[0]?.swipe?.label).toBe("P");
  });
});
