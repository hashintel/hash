/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { use, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  type Place,
  type SelectionItem,
} from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { PlacePropertiesProvider } from "../context";
import { placeMainContentSubView } from "./main";

vi.mock("../../../../../../monaco/code-workspace", () => ({
  useCodeWorkspace: () => ({ enabled: false }),
}));

afterEach(cleanup);

const PlaceMainContent = placeMainContentSubView.component;
const initialPlace: Place = {
  id: "place-1",
  name: "Orders",
  colorId: "type-1",
  dynamicsEnabled: true,
  differentialEquationId: "equation-1",
  x: 0,
  y: 0,
};

const Harness = ({
  readOnly = false,
  selectItem = vi.fn(),
}: {
  readOnly?: boolean;
  selectItem?: (item: SelectionItem) => void;
}) => {
  const sdcpnDefaults = use(SDCPNContext);
  const editorDefaults = use(EditorContext);
  const activeNetDefaults = use(ActiveNetContext);
  const [place, setPlace] = useState(initialPlace);
  const types = [
    {
      id: "type-1",
      name: "Order",
      iconSlug: "circle",
      displayColor: "#3366ff",
      elements: [],
    },
  ];

  return (
    <SDCPNContext
      value={{
        ...sdcpnDefaults,
        readonly: readOnly,
        extensions: DEFAULT_PETRINAUT_EXTENSIONS,
      }}
    >
      <EditorContext value={{ ...editorDefaults, selectItem }}>
        <ActiveNetContext
          value={{
            ...activeNetDefaults,
            activeNet: {
              ...activeNetDefaults.activeNet,
              types,
              differentialEquations: [
                {
                  id: "equation-1",
                  name: "Order aging",
                  colorId: "type-1",
                  code: "return [];",
                },
              ],
            },
          }}
        >
          <PlacePropertiesProvider
            place={place}
            placeType={null}
            types={types}
            isReadOnly={readOnly}
            updatePlace={({ update }) =>
              setPlace((currentPlace) => ({ ...currentPlace, ...update }))
            }
          >
            <PlaceMainContent />
          </PlacePropertiesProvider>
        </ActiveNetContext>
      </EditorContext>
    </SDCPNContext>
  );
};

describe("Place properties", () => {
  it.each(["Component port", "Token capacity", "Default starting place"])(
    "toggles %s by clicking its visible label",
    async (label) => {
      render(<Harness />);
      const input = screen.getByRole<HTMLInputElement>("checkbox", {
        name: label,
      });
      expect(input.checked).toBe(false);
      await act(async () => {
        fireEvent.click(screen.getByText(label, { exact: true }));
      });
      expect(input.checked).toBe(true);
      await act(async () => {
        fireEvent.click(screen.getByText(label, { exact: true }));
      });
      expect(input.checked).toBe(false);
    },
  );

  it("keeps label clicks read-only", async () => {
    render(<Harness readOnly />);
    for (const label of [
      "Component port",
      "Token capacity",
      "Default starting place",
    ]) {
      const input = screen.getByRole<HTMLInputElement>("checkbox", {
        name: label,
      });
      expect(input.disabled).toBe(true);
      await act(async () => {
        fireEvent.click(screen.getByText(label, { exact: true }));
      });
      expect(input.checked).toBe(false);
    }
  });

  it("shows a labelled capacity input only when enabled", async () => {
    render(<Harness />);
    expect(screen.queryByLabelText("Maximum tokens")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByText("Token capacity", { exact: true }));
    });
    expect(
      screen.getByLabelText<HTMLInputElement>("Maximum tokens").value,
    ).toBe("1");
    await act(async () => {
      fireEvent.click(screen.getByText("Token capacity", { exact: true }));
    });
    expect(screen.queryByLabelText("Maximum tokens")).toBeNull();
  });

  it.each([false, true])(
    "opens the assigned type and equation (read-only: %s)",
    (readOnly) => {
      const selectItem = vi.fn();
      render(<Harness readOnly={readOnly} selectItem={selectItem} />);
      fireEvent.click(screen.getByRole("button", { name: /View type/ }));
      expect(selectItem).toHaveBeenLastCalledWith({
        type: "type",
        id: "type-1",
      });
      fireEvent.click(screen.getByRole("button", { name: /View equation/ }));
      expect(selectItem).toHaveBeenLastCalledWith({
        type: "differentialEquation",
        id: "equation-1",
      });
    },
  );

  it("associates the name and description labels with their fields", () => {
    render(<Harness />);
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "Name" }).value,
    ).toBe("Orders");
    expect(screen.getByRole("textbox", { name: "Description" })).toBeDefined();
  });
});
