/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";

import { documentViewPlugin } from "./document-view-plugin";
import { usePluginBottomPanelViews } from "./plugin-outlets";
import { renderPlugins } from "./plugins-test-harness";
import { useRunningPlugins } from "./running-plugins";

beforeEach(() => {
  localStorage.clear();
});

afterEach(cleanup);

/** The plugins' views as the bottom panel would draw the active one. */
const Views = () =>
  usePluginBottomPanelViews().map((view) => (
    <section key={view.id} aria-label={view.title}>
      {view.content}
      {view.headerAction}
    </section>
  ));

/** The plugin's setting as a button that flips it, in place of its switch in User settings. */
const SettingSwitch = () =>
  useRunningPlugins().map(({ manifest, settings }) => (
    <button
      key={manifest.id}
      type="button"
      onClick={() =>
        settings.set("showDocument", !settings.get("showDocument"))
      }
    >
      Show document view
    </button>
  ));

/** Renders the plugin with its setting on, and a place added once the view is up. */
const renderShown = () => {
  localStorage.setItem(
    "petrinaut:plugin:hash.document",
    JSON.stringify({ showDocument: true }),
  );
  const rendered = renderPlugins(
    [documentViewPlugin],
    <>
      <Views />
      <SettingSwitch />
    </>,
  );
  const addPlace = (name: string) =>
    act(() => {
      rendered.instance.mutations.addPlace({
        id: name.toLowerCase(),
        name,
        colorId: null,
        dynamicsEnabled: false,
        x: 0,
        y: 0,
      });
    });

  return { ...rendered, addPlace };
};

/** The lines of the document's outline, or of the changes' when they show as sent, as text. */
const outline = (name: "Document" | "Changes") =>
  within(screen.getByRole("tree", { name }))
    .queryAllByRole("treeitem")
    .map((row) => row.textContent);

/** The patches of the formatted changes: what each did, where, and its value, and whether it starts a change. */
const patches = () =>
  within(screen.getByRole("list", { name: "Changes" }))
    .queryAllByRole("listitem")
    .map((patch) => [
      ...[...patch.children].map((part) => part.textContent),
      ...("startsChange" in patch.dataset ? [] : ["same change"]),
    ]);

/** Picks how the changes show, and waits for the control to report it. */
const showChangesAs = async (name: "Formatted" | "Raw") => {
  fireEvent.click(screen.getByRole("radio", { name }));
  await screen.findByRole(name === "Raw" ? "tree" : "list", {
    name: "Changes",
  });
};

/** The row of an outline, the document's unless named, whose line starts with `text`. */
const row = (
  text: string,
  name: "Document" | "Changes" = "Document",
): HTMLElement => {
  const found = within(screen.getByRole("tree", { name }))
    .getAllByRole("treeitem")
    .find((item) => item.textContent.startsWith(text));
  if (!found) {
    throw new Error(`No row starts with ${text}`);
  }
  return found;
};

/** Presses a key on the row that holds focus. */
const press = (key: string) =>
  fireEvent.keyDown(document.activeElement!, { key });

it("adds no tab until its setting is switched on", () => {
  renderPlugins([documentViewPlugin], <Views />);

  expect(screen.queryByRole("region", { name: "Document data" })).toBeNull();
});

it("shows what the handle holds, each item of a list under its place in it", () => {
  const { addPlace } = renderShown();
  expect(screen.getByRole("region", { name: "Document data" })).toBeTruthy();

  // An empty net: every list it holds is empty.
  expect(outline("Document")).toEqual([
    "places:[]",
    "transitions:[]",
    "types:[]",
    "differentialEquations:[]",
    "parameters:[]",
  ]);

  addPlace("Stock");
  addPlace("Sold");

  expect(outline("Document").slice(0, 4)).toEqual([
    "places:",
    expect.stringMatching(/^0:\{ name: "Stock", id: "/),
    expect.stringMatching(/^1:\{ name: "Sold", id: "/),
    "transitions:[]",
  ]);
});

it("follows the handle once the instance has let go of it, as a strict-mode remount makes it", () => {
  const { instance, addPlace } = renderShown();

  act(() => instance.dispose());
  addPlace("Stock");

  expect(outline("Document")[1]).toMatch(/^0:\{ name: "Stock"/);
});

it("lists the patches of each change, latest first: what each did and where, then its value", () => {
  const { instance, addPlace } = renderShown();
  expect(patches()).toEqual([]);
  expect(
    screen.getByText(
      "Edit the net to see what each change does to the document.",
    ),
  ).toBeTruthy();

  addPlace("Stock");
  expect(patches()).toEqual([
    ["add", "/places/0", expect.stringMatching(/^\{ name: "Stock", id: "/)],
  ]);

  // One change of two patches, then one whose patch holds no value.
  const placeId = instance.handle.doc()!.places[0]!.id;
  act(() => {
    instance.mutations.updatePlacePosition({
      placeId,
      position: { x: 120, y: 80 },
    });
  });
  act(() => {
    instance.mutations.removePlace({ placeId });
  });
  expect(patches()).toEqual([
    ["remove", "/places/0"],
    ["replace", "/places/0/x", "120"],
    ["replace", "/places/0/y", "80", "same change"],
    ["add", "/places/0", expect.stringMatching(/^\{ name: "Stock", id: "/)],
  ]);

  // The patches are one tab stop, walked by the arrows.
  const [first, second] = within(
    screen.getByRole("list", { name: "Changes" }),
  ).getAllByRole("listitem");
  act(() => first!.focus());
  press("ArrowDown");
  expect(document.activeElement).toBe(second);
  expect([first!.tabIndex, second!.tabIndex]).toEqual([-1, 0]);
});

it("starts the changes over when its setting is switched off and on again", () => {
  const { addPlace } = renderShown();
  const flipSetting = () =>
    fireEvent.click(screen.getByRole("button", { name: "Show document view" }));
  addPlace("Stock");
  expect(patches()).toHaveLength(1);

  flipSetting();
  expect(screen.queryByRole("region", { name: "Document data" })).toBeNull();
  // A change the tab was not there to see leaves no gap in the list.
  addPlace("Sold");
  flipSetting();

  expect(patches()).toEqual([]);
  addPlace("Spare");
  expect(patches().map(([, target]) => target)).toEqual(["/places/2"]);
});

it("shows a move through the handle's history as a restore: the entry it went to, then the document there", async () => {
  const { instance, addPlace } = renderShown();
  addPlace("Stock");
  addPlace("Sold");

  act(() => {
    instance.handle.history?.undo();
  });
  expect(patches()[0]).toEqual([
    "restore",
    "{ index: 1 }",
    expect.stringMatching(/^\{ places: \[1 item\], transitions: \[\], /),
  ]);
  const [restore, add] = within(
    screen.getByRole("list", { name: "Changes" }),
  ).getAllByRole("listitem");
  expect([restore!.dataset.op, add!.dataset.op]).toEqual(["restore", "add"]);

  act(() => {
    instance.handle.history?.goToIndex(0);
  });
  expect(patches()[0]).toEqual([
    "restore",
    "{ index: 0 }",
    expect.stringMatching(/^\{ places: \[\], transitions: \[\], /),
  ]);

  // As sent, the move keeps its patches, and names the entry beside them.
  await showChangesAs("Raw");
  expect(outline("Changes").slice(0, 6)).toEqual([
    "0:",
    "patches:",
    '0:{ op: "replace", path: [], … }',
    'source:"local"',
    "restored:",
    "index:0",
  ]);
});

it("shows each change as the handle sent it, on request", async () => {
  const { addPlace } = renderShown();
  addPlace("Stock");
  expect(screen.queryByRole("tree", { name: "Changes" })).toBeNull();

  await showChangesAs("Raw");
  expect(screen.queryByRole("list", { name: "Changes" })).toBeNull();
  expect(outline("Changes")).toEqual([
    "0:",
    "patches:",
    // The path as the list it was sent as.
    '0:{ op: "add", path: ["places", 0], … }',
    'source:"local"',
  ]);

  // Expand and collapse all reach the changes too.
  fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
  expect(outline("Changes")).toEqual([
    "0:",
    "patches:[1 item]",
    'source:"local"',
  ]);

  await showChangesAs("Formatted");
  expect(patches()).toHaveLength(1);
});

it("keeps a patch's row with its change when a newer change arrives", () => {
  const { addPlace } = renderShown();
  addPlace("Stock");
  const [stock] = within(
    screen.getByRole("list", { name: "Changes" }),
  ).getAllByRole("listitem");
  act(() => stock!.focus());

  addPlace("Sold");

  expect(patches().map(([, target]) => target)).toEqual([
    "/places/1",
    "/places/0",
  ]);
  expect(document.activeElement).toBe(stock);
  expect(stock!.textContent).toMatch(/^add\/places\/0\{ name: "Stock"/);
});

it("keeps a row of a change as sent open when a newer change arrives", async () => {
  const { addPlace } = renderShown();
  addPlace("Stock");
  await showChangesAs("Raw");
  fireEvent.click(within(row("0:{", "Changes")).getByText(/op: "add"/));

  addPlace("Sold");

  // Each change still goes under its place in the list, and holds what was sent.
  expect(outline("Changes")).toEqual([
    "0:",
    "patches:",
    '0:{ op: "add", path: ["places", 1], … }',
    'source:"local"',
    "1:",
    "patches:",
    "0:",
    'op:"add"',
    'path:["places", 0]',
    expect.stringMatching(/^value:\{ name: "Stock", id: "/),
    'source:"local"',
  ]);
});

it("draws no more rows than its limit, and says that rows are left out", () => {
  const { instance } = renderShown();
  const note = "Only the first 2,000 rows are shown.";

  // One change of 2,500 patches, and a document of as many places.
  act(() => {
    instance.handle.change((draft) => {
      for (let index = 0; index < 2500; index++) {
        draft.places.push({
          id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          name: `Place${index}`,
          colorId: null,
          dynamicsEnabled: false,
          x: 0,
          y: 0,
        });
      }
    });
  });

  expect(outline("Document")).toHaveLength(2000);
  expect(patches()).toHaveLength(2000);
  expect(screen.getAllByText(note)).toHaveLength(2);

  fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
  expect(outline("Document")[0]).toBe("places:[2500 items]");
  expect(screen.getAllByText(note)).toHaveLength(1);
  // Four thousand rows take seconds to draw on a loaded machine.
}, 30_000);

it("opens and closes rows by a click on their line, and all at once", () => {
  const { addPlace } = renderShown();
  addPlace("Stock");

  fireEvent.click(within(row("0:")).getByText(/name: "Stock"/));
  expect(outline("Document")).toContain('name:"Stock"');

  fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
  expect(outline("Document")[0]).toBe("places:[1 item]");
  expect(row("places:").getAttribute("aria-expanded")).toBe("false");

  fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
  expect(outline("Document")).toContain('name:"Stock"');
});

it("is one tab stop whose rows the arrows walk, opening and closing them", () => {
  const { addPlace } = renderShown();
  addPlace("Stock");
  const tabStops = () =>
    within(screen.getByRole("tree", { name: "Document" }))
      .getAllByRole("treeitem")
      .filter((item) => item.tabIndex === 0)
      .map((item) => item.textContent);
  const expanded = () => document.activeElement?.getAttribute("aria-expanded");

  expect(tabStops()).toEqual(["places:"]);

  act(() => row("places:").focus());
  press("ArrowDown");
  expect(document.activeElement).toBe(row("0:"));
  expect(tabStops()).toHaveLength(1);
  expect(expanded()).toBe("false");

  // ArrowRight opens a closed row and stays on it.
  press("ArrowRight");
  expect(expanded()).toBe("true");
  expect(outline("Document")).toContain('name:"Stock"');

  press("ArrowDown");
  // Its first entry: the id the editor gave the place.
  expect(document.activeElement?.textContent).toMatch(/^id:"/);
  press("ArrowUp");

  // ArrowLeft closes an open row, and on a closed one it is a move: there
  // is nothing to the left of the document.
  press("ArrowLeft");
  expect(expanded()).toBe("false");
  expect(outline("Document")).not.toContain('name:"Stock"');
  press("ArrowLeft");
  expect(document.activeElement).toBe(row("0:"));
  expect(expanded()).toBe("false");

  // ArrowRight on an open row is a move too: into the changes beside it.
  press("ArrowUp");
  expect(document.activeElement).toBe(row("places:"));
  press("ArrowRight");
  expect(
    screen
      .getByRole("list", { name: "Changes" })
      .contains(document.activeElement),
  ).toBe(true);
  expect(document.activeElement?.textContent).toMatch(/^add\/places\/0/);
  press("ArrowLeft");
  expect(document.activeElement).toBe(row("places:"));

  // Enter and Space open and close a row as a click does.
  press("ArrowDown");
  press("Enter");
  expect(expanded()).toBe("true");
  press(" ");
  expect(expanded()).toBe("false");
});
