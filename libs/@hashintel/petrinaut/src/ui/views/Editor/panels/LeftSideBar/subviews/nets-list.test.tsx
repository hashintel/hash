/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { use, useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
  type Component,
} from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../../../../react/document/active-net-context";
import { PetrinautInstanceContext } from "../../../../../../react/document/instance-context";
import { SDCPNContext } from "../../../../../../react/document/sdcpn-context";
import { useStore } from "../../../../../../react/shared/use-store";
import { PetrinautPresentationProvider } from "../../../../shared/presentation-provider";
import { NetNavigationList } from "./nets-list";

import type { PetrinautPresentationProfile } from "../../../../shared/presentation-context";

afterEach(cleanup);

const component = (name: string): Component => ({
  id: name,
  name,
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
});

/**
 * The list over a document with the components Belt and Scale. The list
 * follows the document and the open net as the editor's providers make it.
 */
const renderList = ({
  readonly = false,
  profile = "editor",
  open = "Root",
}: {
  readonly?: boolean;
  profile?: PetrinautPresentationProfile;
  open?: "Root" | "Belt" | "Scale";
} = {}) => {
  const instance = createPetrinaut({
    document: createJsonDocHandle({
      initial: {
        places: [],
        transitions: [],
        types: [],
        differentialEquations: [],
        parameters: [],
        components: [component("Belt"), component("Scale")],
      },
    }),
  });
  const onSelect = vi.fn();
  // Core gives the components ids of its own, so a case names the open net.
  const openId =
    instance.definition.get().components?.find(({ name }) => name === open)
      ?.id ?? null;

  const Wrapper = ({ children }: { children: ReactNode }) => {
    const document = use(SDCPNContext);
    const activeNet = use(ActiveNetContext);
    const petriNetDefinition = useStore(instance.definition);
    const [activeComponentId, setActiveComponentId] = useState(openId);
    return (
      <PetrinautInstanceContext value={instance}>
        <SDCPNContext value={{ ...document, petriNetDefinition, readonly }}>
          <ActiveNetContext
            value={{ ...activeNet, activeComponentId, setActiveComponentId }}
          >
            <PetrinautPresentationProvider profile={profile}>
              {children}
            </PetrinautPresentationProvider>
          </ActiveNetContext>
        </SDCPNContext>
      </PetrinautInstanceContext>
    );
  };
  render(<NetNavigationList onSelect={onSelect} />, { wrapper: Wrapper });

  return {
    onSelect,
    componentNames: () =>
      (instance.definition.get().components ?? []).map(({ name }) => name),
  };
};

/** A row by the name it shows: its accessible name goes on with its buttons'. */
const row = (name: string) =>
  screen.getByRole("option", {
    name: (accessibleName) => accessibleName.startsWith(name),
  });
const openNet = () => screen.getByRole("option", { selected: true });

/** Opens the rename input of a row and types a name into it. */
const typeName = (rowName: string, name: string): HTMLElement => {
  fireEvent.doubleClick(row(rowName));
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: name } });
  return input;
};

describe("the Nets list", () => {
  it("lists Root and every component, with the open net selected", () => {
    renderList({ open: "Scale" });

    expect(screen.getAllByRole("option")).toEqual([
      row("Root"),
      row("Belt"),
      row("Scale"),
    ]);
    expect(openNet()).toBe(row("Scale"));
  });

  it("opens a net on a click or on Enter, and tells its host each time", () => {
    const { onSelect } = renderList();

    fireEvent.click(row("Belt"));
    expect(openNet()).toBe(row("Belt"));
    expect(onSelect).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(row("Root"), { key: "Enter" });
    expect(openNet()).toBe(row("Root"));
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("renames a component on a double click, with its name selected to type over", () => {
    const { onSelect, componentNames } = renderList();

    fireEvent.doubleClick(row("Belt"));
    const input = screen.getByRole<HTMLInputElement>("textbox");
    expect(input.value).toBe("Belt");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 4]);

    fireEvent.change(input, { target: { value: "  Conveyor " } });
    // A click in the input places the caret and does not open the net.
    fireEvent.click(input);
    fireEvent.keyDown(input, { key: "Enter" });

    expect(componentNames()).toEqual(["Conveyor", "Scale"]);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("commits the new name when the input loses focus", () => {
    const { componentNames } = renderList();

    fireEvent.blur(typeName("Scale", "Gauge"));

    expect(componentNames()).toEqual(["Belt", "Gauge"]);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it.each([
    ["on Escape", "Conveyor", "Escape"],
    ["when the new one is blank", "   ", "Enter"],
  ])("keeps the name %s", (_when, typed, key) => {
    const { componentNames } = renderList();

    fireEvent.keyDown(typeName("Belt", typed), { key });

    expect(componentNames()).toEqual(["Belt", "Scale"]);
    expect(row("Belt")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("deletes a component from its row button or with Delete, and goes back to Root when it was open", () => {
    const { componentNames } = renderList({ open: "Belt" });

    fireEvent.click(
      within(row("Belt")).getByRole("button", { name: "Delete component" }),
    );
    expect(componentNames()).toEqual(["Scale"]);
    expect(openNet()).toBe(row("Root"));

    fireEvent.keyDown(row("Scale"), { key: "Delete" });
    expect(componentNames()).toEqual([]);
    expect(document.activeElement).toBe(row("Root"));
  });

  it("keeps Root on Delete", () => {
    const { componentNames } = renderList();

    fireEvent.keyDown(row("Root"), { key: "Delete" });

    expect(componentNames()).toEqual(["Belt", "Scale"]);
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("refuses a rename and a delete in a read-only document", () => {
    const { componentNames } = renderList({ readonly: true });

    fireEvent.doubleClick(row("Belt"));
    expect(screen.queryByRole("textbox")).toBeNull();

    const deleteButton = within(row("Belt")).getByRole<HTMLButtonElement>(
      "button",
      { name: "Delete component" },
    );
    expect(deleteButton.disabled).toBe(true);
    fireEvent.keyDown(row("Belt"), { key: "Delete" });
    expect(componentNames()).toEqual(["Belt", "Scale"]);
  });

  it("offers no rename, options or delete where the presentation hides what edits the net", () => {
    const { componentNames } = renderList({ profile: "review" });

    expect(screen.queryAllByRole("button")).toEqual([]);
    fireEvent.doubleClick(row("Belt"));
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.keyDown(row("Belt"), { key: "Delete" });
    expect(componentNames()).toEqual(["Belt", "Scale"]);
  });
});
