// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { createContext, useEffect } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { ErrorTrackerContext } from "@hashintel/petrinaut";
import { createJsonDocHandle } from "@hashintel/petrinaut-core";

import { EmbedPetrinaut } from "./embed-petrinaut";

import type { EntityId } from "@blockprotocol/type-system";
import type { useBrunchAssistant } from "@hashintel/brunch-agent/ui";
import type { ErrorTracker } from "@hashintel/petrinaut";

const observed = vi.hoisted(() => ({
  /** The plugins each editor render got. */
  petrinautPlugins: [] as unknown[][],
  petrinautMounts: 0,
  brunchInputs: [] as Parameters<typeof useBrunchAssistant>[0][],
}));

const brunchPluginMarker = vi.hoisted(() => ({ id: "brunch" }));
const embedChromePluginMarker = vi.hoisted(() => ({ id: "embed-chrome" }));

vi.mock("@hashintel/petrinaut", () => ({
  ErrorTrackerContext: createContext<ErrorTracker>({
    captureException: () => {},
  }),
  Petrinaut: ({ plugins }: { plugins: unknown[] }) => {
    observed.petrinautPlugins.push(plugins);
    useEffect(() => {
      observed.petrinautMounts += 1;
    }, []);
    return null;
  },
}));

vi.mock("@hashintel/brunch-agent/ui", () => ({
  BrunchAssistantContext: createContext(null),
  useBrunchAssistant: (input: Parameters<typeof useBrunchAssistant>[0]) => {
    observed.brunchInputs.push(input);
    return {
      assistant: { presentation: "brunch" },
      plugins: [...input.plugins, brunchPluginMarker],
    };
  },
}));

vi.mock("./embed-chrome-plugin", () => ({
  embedChromePlugin: embedChromePluginMarker,
}));

vi.mock("../../../../shared/auth-info-context", () => ({
  useAuthInfo: () => ({ authenticatedUser: { accountId: "alice-account" } }),
}));

const handle = createJsonDocHandle({
  initial: {
    places: [],
    transitions: [],
    types: [],
    differentialEquations: [],
    parameters: [],
  },
});

const savedEntityId = "web~net" as EntityId;

const captureException = vi.fn<ErrorTracker["captureException"]>();

let identityResponse: () => Promise<Response>;
const fetchMock = vi.fn<typeof fetch>(() => identityResponse());

beforeEach(() => {
  observed.petrinautPlugins.length = 0;
  observed.petrinautMounts = 0;
  observed.brunchInputs.length = 0;
  captureException.mockClear();
  fetchMock.mockClear();
  identityResponse = () =>
    Promise.resolve(Response.json({ ownerKey: "hash:alice-account" }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderEditor = (props: {
  savedEntityId: EntityId | null;
  readonly: boolean;
}) => {
  const element = (next: typeof props) => (
    <ErrorTrackerContext value={{ captureException }}>
      <EmbedPetrinaut
        handle={handle}
        readTitle={() => "Net"}
        setTitle={() => {}}
        title="Net"
        {...next}
      />
    </ErrorTrackerContext>
  );
  const view = render(element(props));
  return {
    rerender: (next: typeof props) => view.rerender(element(next)),
  };
};

/** Lets the identity request's response reach the component. */
const settleIdentity = async () => {
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await act(async () => {
    await fetchMock.mock.results[0]?.value;
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
};

const lastPlugins = () => observed.petrinautPlugins.at(-1);

test("Brunch is offered on an editable saved net only once the owner key is known", async () => {
  let respond: (response: Response) => void = () => {};
  identityResponse = () =>
    new Promise((resolve) => {
      respond = resolve;
    });
  renderEditor({ savedEntityId, readonly: false });

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(observed.brunchInputs).toHaveLength(0);
  expect(lastPlugins()).toEqual([embedChromePluginMarker]);

  act(() => respond(Response.json({ ownerKey: "hash:alice-account" })));

  await waitFor(() =>
    expect(lastPlugins()).toEqual([
      embedChromePluginMarker,
      brunchPluginMarker,
    ]),
  );
  expect(observed.brunchInputs.length).toBeGreaterThan(0);
  for (const input of observed.brunchInputs) {
    expect(input).toMatchObject({
      ownerKey: "hash:alice-account",
      selected: true,
      openDocument: { documentId: savedEntityId, editor: { handle } },
    });
  }
  expect(observed.petrinautMounts).toBe(1);
  expect(captureException).not.toHaveBeenCalled();
});

test("a 503 from the identity route turns Brunch off without reporting it", async () => {
  identityResponse = () => Promise.resolve(new Response(null, { status: 503 }));
  renderEditor({ savedEntityId, readonly: false });

  await settleIdentity();

  expect(observed.brunchInputs).toHaveLength(0);
  expect(lastPlugins()).toEqual([embedChromePluginMarker]);
  expect(captureException).not.toHaveBeenCalled();
});

test("other identity failures are still reported, and offer no Brunch", async () => {
  identityResponse = () => Promise.resolve(new Response(null, { status: 500 }));
  renderEditor({ savedEntityId, readonly: false });

  await settleIdentity();

  expect(captureException).toHaveBeenCalledTimes(1);
  expect(captureException).toHaveBeenCalledWith(
    expect.objectContaining({
      message: "The Brunch identity request failed with status 500",
    }),
    { source: "brunch.identity" },
  );
  expect(observed.brunchInputs).toHaveLength(0);
  expect(lastPlugins()).toEqual([embedChromePluginMarker]);
});

test("a net the user may not edit gets no Brunch, and gaining or losing permission keeps the editor mounted", async () => {
  const { rerender } = renderEditor({ savedEntityId, readonly: true });
  await settleIdentity();

  expect(observed.brunchInputs).toHaveLength(0);
  expect(lastPlugins()).toEqual([embedChromePluginMarker]);

  rerender({ savedEntityId, readonly: false });
  await waitFor(() =>
    expect(lastPlugins()).toEqual([
      embedChromePluginMarker,
      brunchPluginMarker,
    ]),
  );

  rerender({ savedEntityId, readonly: true });
  await waitFor(() => expect(lastPlugins()).toEqual([embedChromePluginMarker]));

  expect(observed.petrinautMounts).toBe(1);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("an unsaved draft gets no Brunch", async () => {
  renderEditor({ savedEntityId: null, readonly: false });
  await settleIdentity();

  expect(observed.brunchInputs).toHaveLength(0);
  expect(lastPlugins()).toEqual([embedChromePluginMarker]);
});
