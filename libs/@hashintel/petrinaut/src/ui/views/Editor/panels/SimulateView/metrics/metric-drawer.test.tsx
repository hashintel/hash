/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  generatePetrinautId,
} from "@hashintel/petrinaut-core";

import { SDCPNContext } from "../../../../../../react/document/sdcpn-context";
import {
  DEFAULT_LANGUAGE_CLIENT_CONTEXT,
  LanguageClientContext,
} from "../../../../../../react/lsp/context";
import { MetricDrawer } from "./metric-drawer";

import type { SDCPNContextValue } from "../../../../../../react/document/sdcpn-context";
import type { LanguageClientContextValue } from "../../../../../../react/lsp/context";
import type { Metric } from "@hashintel/petrinaut-core";
import type { ReactNode } from "react";

const mutations = vi.hoisted(() => ({
  addMetric: vi.fn(),
  updateMetric: vi.fn(),
  removeMetric: vi.fn(),
}));
vi.mock("../../../../../../react", () => ({
  usePetrinautMutations: () => mutations,
}));

// Monaco cannot run in jsdom: the code editor becomes a plain textarea.
vi.mock("../../../../../monaco/code-editor", () => ({
  CodeEditor: ({
    onChange,
    value,
  }: {
    onChange?: (value: string | undefined) => void;
    value?: string;
  }) => (
    <textarea
      aria-label="Metric code"
      value={value ?? ""}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

vi.mock("@hashintel/ds-components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hashintel/ds-components")>();
  // The real Drawer portals its content where testing-library cannot reach
  // it from this tree; its parts become plain elements.
  const Drawer = Object.assign(
    ({ children }: { children: ReactNode }) => <div>{children}</div>,
    {
      Header: ({ title }: { title: string }) => <h2>{title}</h2>,
      Body: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      Footer: ({ actions }: { actions: ReactNode }) => <div>{actions}</div>,
    },
  );
  return { ...actual, Drawer };
});

afterEach(cleanup);
beforeEach(() => {
  mutations.addMetric.mockReset();
  mutations.updateMetric.mockReset();
  mutations.removeMetric.mockReset();
});

const queueLength: Metric = {
  id: generatePetrinautId(),
  name: "Queue length",
  code: "return state.places.Queue.count;",
};

const sdcpnContextValue: SDCPNContextValue = {
  petriNetId: "test-net",
  petriNetDefinition: {
    places: [],
    transitions: [],
    types: [],
    parameters: [],
    differentialEquations: [],
    metrics: [queueLength],
  },
  readonly: false,
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
  getItemType: () => null,
};

// The default client compiles nothing; here every submitted metric compiles.
const requestHirArtifacts: LanguageClientContextValue["requestHirArtifacts"] =
  async (sdcpn, ...rest) => {
    const result = await DEFAULT_LANGUAGE_CLIENT_CONTEXT.requestHirArtifacts(
      sdcpn,
      ...rest,
    );
    const metrics = Object.fromEntries(
      (sdcpn.metrics ?? []).map((metric) => [metric.id, {}]),
    ) as typeof result.artifacts.metrics;
    return { ...result, artifacts: { ...result.artifacts, metrics } };
  };

const renderDrawer = (metric?: Metric) => {
  const client = {
    ...DEFAULT_LANGUAGE_CLIENT_CONTEXT,
    requestHirArtifacts,
    initializeMetricSession:
      vi.fn<LanguageClientContextValue["initializeMetricSession"]>(),
    killMetricSession: vi.fn<LanguageClientContextValue["killMetricSession"]>(),
  };
  const onClose = vi.fn();
  const view = render(
    <LanguageClientContext value={client}>
      <SDCPNContext value={sdcpnContextValue}>
        <MetricDrawer metric={metric} onClose={onClose} />
      </SDCPNContext>
    </LanguageClientContext>,
  );
  return { client, onClose, view };
};

const button = (name: RegExp) =>
  screen.getByRole("button", { name }) as HTMLButtonElement;

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("MetricDrawer", () => {
  it("creates a metric from a name and code, in a language session of its own", async () => {
    const { client, onClose, view } = renderDrawer();

    expect(client.initializeMetricSession).toHaveBeenCalledOnce();
    const sessionId =
      client.initializeMetricSession.mock.lastCall?.[0].sessionId;

    expect(screen.queryByRole("button", { name: /Delete$/ })).toBeNull();
    expect(button(/Cancel$/)).toBeDefined();
    expect(button(/Create$/).disabled).toBe(true);

    type("Metric name", "Throughput");
    type("Metric code", "return 1;");
    expect(button(/Create$/).disabled).toBe(false);

    fireEvent.click(button(/Create$/));
    await waitFor(() => expect(mutations.addMetric).toHaveBeenCalledOnce());
    expect(mutations.addMetric.mock.lastCall?.[0]).toMatchObject({
      name: "Throughput",
      code: "return 1;",
    });
    expect(onClose).toHaveBeenCalledOnce();

    view.unmount();
    expect(client.killMetricSession).toHaveBeenCalledExactlyOnceWith(sessionId);
  });

  it("saves a change to a metric under its own name, and deletes it", async () => {
    const { onClose } = renderDrawer(queueLength);

    expect(button(/Close$/)).toBeDefined();
    expect(button(/Save$/).disabled).toBe(true);

    type("Metric code", "return 2;");
    fireEvent.click(button(/Save$/));
    await waitFor(() =>
      expect(mutations.updateMetric).toHaveBeenCalledExactlyOnceWith({
        metricId: queueLength.id,
        update: { name: "Queue length", code: "return 2;" },
      }),
    );
    expect(onClose).toHaveBeenCalledOnce();

    fireEvent.click(button(/Delete$/));
    expect(mutations.removeMetric).toHaveBeenCalledExactlyOnceWith({
      metricId: queueLength.id,
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
