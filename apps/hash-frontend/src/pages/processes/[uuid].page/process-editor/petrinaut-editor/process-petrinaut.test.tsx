// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { createContext, use, useEffect, useLayoutEffect } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { ErrorTrackerContext } from "@hashintel/petrinaut";
import { createJsonDocHandle } from "@hashintel/petrinaut-core";

import { ProcessPetrinaut } from "./process-petrinaut";

import type { EntityId } from "@blockprotocol/type-system";
import type * as BrunchUi from "@hashintel/brunch-agent/ui";
import type { ErrorTracker, PetrinautDocHandle } from "@hashintel/petrinaut";

vi.hoisted(() => {
  window.matchMedia = (media) => ({
    media,
    matches: false,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  });
});

const observed = vi.hoisted(() => ({
  /** The plugins each editor render got. */
  petrinautPlugins: [] as unknown[][],
  petrinautMounts: 0,
  brunchInputs: [] as Parameters<typeof BrunchUi.useBrunchAssistant>[0][],
}));

const brunchPluginMarker = vi.hoisted(() => ({ id: "brunch" }));
const topBarPluginMarker = vi.hoisted(() => ({ id: "top-bar" }));
const brunchHostContext = await vi.hoisted(async () => {
  const { createContext: createHostContext } = await import("react");
  return createHostContext<BrunchUi.BrunchAssistantHost | null>(null);
});

vi.mock("@hashintel/petrinaut", () => ({
  ErrorTrackerContext: createContext<ErrorTracker>({
    captureException: () => {},
  }),
  Petrinaut: ({
    handle: editorHandle,
    plugins,
  }: {
    handle: PetrinautDocHandle;
    plugins: unknown[];
  }) => {
    observed.petrinautPlugins.push(plugins);
    useEffect(() => {
      observed.petrinautMounts += 1;
    }, []);
    // Brunch is the only assistant, so the editor shows it, mounting its
    // content, which marks it as shown, while its plugin is listed.
    const show = use(brunchHostContext)?.show;
    const brunchListed = plugins.includes(brunchPluginMarker);
    useLayoutEffect(
      () => (brunchListed ? show?.(editorHandle.id) : undefined),
      [brunchListed, show, editorHandle.id],
    );
    return null;
  },
}));

vi.mock("@hashintel/brunch-agent/ui", async (importOriginal) => ({
  createHashPetrinautSaveTool: (await importOriginal<typeof BrunchUi>())
    .createHashPetrinautSaveTool,
  BrunchAssistantContext: brunchHostContext,
  brunchPlugin: brunchPluginMarker,
  hashPetrinautHostTools: [],
  useBrunchAssistant: (
    input: Parameters<typeof BrunchUi.useBrunchAssistant>[0],
  ) => {
    observed.brunchInputs.push(input);
    return { assistant: {}, openAIVoiceConfig: null };
  },
}));

const hashGraphReadTools = vi.hoisted((): unknown[] => []);

vi.mock("./process-petrinaut/brunch-hash-graph-reads", () => ({
  useBrunchHashGraphReadTools: () => hashGraphReadTools,
}));

vi.mock("./process-petrinaut/use-brunch-conversation-pointer", () => {
  // Stable, as the hook's is while the stored conversation is unchanged.
  const conversationPointer = { conversationId: null, replace: () => {} };
  return { useBrunchConversationPointer: () => conversationPointer };
});
vi.mock("./process-petrinaut/top-bar-plugin", () => ({
  topBarPlugin: topBarPluginMarker,
}));

const deployment = vi.hoisted(
  (): { brunchOrigin: string | null; accountSignupComplete: boolean } => ({
    brunchOrigin: "https://brunch.test",
    accountSignupComplete: true,
  }),
);

vi.mock("../../../../../lib/public-env", () => ({
  get brunchAgentOrigin() {
    return deployment.brunchOrigin;
  },
}));

vi.mock("../../../../shared/auth-info-context", () => ({
  useAuthInfo: () => ({
    authenticatedUser: {
      accountId: "alice-account",
      accountSignupComplete: deployment.accountSignupComplete,
    },
  }),
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
  deployment.brunchOrigin = "https://brunch.test";
  deployment.accountSignupComplete = true;
  identityResponse = () =>
    Promise.resolve(Response.json({ actorKey: "hash:alice-account" }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const hostSave: BrunchUi.BrunchHostSave = {
  read: () => ({ title: "Net", lastSavedTime: null, refusal: null }),
  save: () => Promise.reject(new Error("These tests never save")),
};

const renderEditor = (props: {
  savedEntityId: EntityId;
  readonly: boolean;
}) => {
  const element = ({ savedEntityId: entityId, readonly }: typeof props) => (
    <ErrorTrackerContext value={{ captureException }}>
      <ProcessPetrinaut
        handle={handle}
        entityId={entityId}
        saved
        readTitle={() => "Net"}
        hostSave={hostSave}
        versionLoad={undefined}
        readonly={readonly}
        setTitle={() => {}}
        title="Net"
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

test("Brunch is offered on an editable saved net only once the actor key is known", async () => {
  let respond: (response: Response) => void = () => {};
  identityResponse = () =>
    new Promise((resolve) => {
      respond = resolve;
    });
  renderEditor({ savedEntityId, readonly: false });

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(observed.brunchInputs).toHaveLength(0);
  expect(lastPlugins()).toEqual([topBarPluginMarker]);

  act(() => respond(Response.json({ actorKey: "hash:alice-account" })));

  await waitFor(() =>
    expect(lastPlugins()).toEqual([topBarPluginMarker, brunchPluginMarker]),
  );
  await waitFor(() =>
    expect(observed.brunchInputs.at(-1)).toMatchObject({ selected: true }),
  );
  for (const input of observed.brunchInputs) {
    expect(input.starterChips).toBeUndefined();
    expect(input).toMatchObject({
      actorKey: "hash:alice-account",
      openDocument: { documentId: savedEntityId, editor: { handle } },
    });
  }
  expect(observed.petrinautMounts).toBe(1);
  expect(captureException).not.toHaveBeenCalled();
});

test("asks Brunch itself for the actor key, with the user's session, and talks to its HASH agent", async () => {
  renderEditor({ savedEntityId, readonly: false });
  await settleIdentity();

  expect(fetchMock).toHaveBeenCalledWith(
    "https://brunch.test/agents/hash/identity",
    expect.objectContaining({ cache: "no-store", credentials: "include" }),
  );
  await waitFor(() =>
    expect(observed.brunchInputs.at(-1)).toMatchObject({
      actorKey: "hash:alice-account",
      chatEndpoint: "https://brunch.test/agents/hash",
    }),
  );
});

test.each([
  ["this deployment has no Brunch", { brunchOrigin: null }],
  ["the account hasn't completed signup", { accountSignupComplete: false }],
])("offers no Brunch, and asks nothing, when %s", async (_case, overrides) => {
  Object.assign(deployment, overrides);
  renderEditor({ savedEntityId, readonly: false });
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });

  expect(fetchMock).not.toHaveBeenCalled();
  expect(observed.brunchInputs).toHaveLength(0);
  expect(lastPlugins()).toEqual([topBarPluginMarker]);
  expect(captureException).not.toHaveBeenCalled();
});

test("Brunch declining the session offers no Brunch and reports nothing", async () => {
  identityResponse = () => Promise.resolve(new Response(null, { status: 401 }));
  renderEditor({ savedEntityId, readonly: false });

  await settleIdentity();

  expect(captureException).not.toHaveBeenCalled();
  expect(observed.brunchInputs).toHaveLength(0);
  expect(lastPlugins()).toEqual([topBarPluginMarker]);
});

test.each([403, 503])(
  "a %s from Brunch's identity route is reported, and offers no Brunch",
  async (status) => {
    identityResponse = () => Promise.resolve(new Response(null, { status }));
    renderEditor({ savedEntityId, readonly: false });

    await settleIdentity();

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: `The Brunch identity request failed with status ${status}`,
      }),
      { source: "brunch.identity" },
    );
    expect(observed.brunchInputs).toHaveLength(0);
    expect(lastPlugins()).toEqual([topBarPluginMarker]);
  },
);

test("a net the user may not edit gets no Brunch, and gaining or losing permission keeps the editor mounted", async () => {
  const { rerender } = renderEditor({ savedEntityId, readonly: true });
  await settleIdentity();

  expect(observed.brunchInputs).toHaveLength(0);
  expect(lastPlugins()).toEqual([topBarPluginMarker]);

  rerender({ savedEntityId, readonly: false });
  await waitFor(() =>
    expect(lastPlugins()).toEqual([topBarPluginMarker, brunchPluginMarker]),
  );

  rerender({ savedEntityId, readonly: true });
  await waitFor(() => expect(lastPlugins()).toEqual([topBarPluginMarker]));

  expect(observed.petrinautMounts).toBe(1);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
