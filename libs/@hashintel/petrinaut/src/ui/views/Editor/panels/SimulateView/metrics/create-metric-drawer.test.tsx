/**
 * @vitest-environment jsdom
 */
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { CreateMetricDrawer } from "./create-metric-drawer";

import type { LanguageClientContextValue } from "../../../../../../react/lsp/context";

vi.mock("../../../../../../react", () => ({
  usePetrinautMutations: () => ({ addMetric: vi.fn() }),
}));

vi.mock("@hashintel/ds-components", () => {
  const Drawer = Object.assign(() => null, {
    Body: () => null,
    Footer: () => null,
    Header: () => null,
  });

  return {
    Button: () => null,
    Drawer,
    TextArea: () => null,
    TextInput: () => null,
  };
});

function makeLanguageClientValue(): LanguageClientContextValue {
  return {
    diagnosticsByUri: new Map(),
    totalDiagnosticsCount: 0,
    errorDiagnosticsCount: 0,
    notifyDocumentChanged: vi.fn(),
    requestCompletion: vi.fn(() =>
      Promise.resolve({ isIncomplete: false, items: [] }),
    ),
    requestHover: vi.fn(() => Promise.resolve(null)),
    requestSignatureHelp: vi.fn(() => Promise.resolve(null)),
    requestHirArtifacts: vi.fn(() =>
      Promise.resolve({
        artifacts: {
          version: 4 as const,
          fingerprint: "0000000000000000",
          dynamics: {},
          lambdas: {},
          kernels: {},
          metrics: {},
        },
        failures: [],
      }),
    ),
    initializeScenarioSession: vi.fn(),
    updateScenarioSession: vi.fn(),
    killScenarioSession: vi.fn(),
    initializeMetricSession: vi.fn(),
    updateMetricSession: vi.fn(),
    killMetricSession: vi.fn(),
  };
}

describe("CreateMetricDrawer", () => {
  it("owns a temporary metric session only while open", async () => {
    const languageClient = makeLanguageClientValue();
    const renderDrawer = (open: boolean) => (
      <LanguageClientContext value={languageClient}>
        <CreateMetricDrawer open={open} onClose={vi.fn()} />
      </LanguageClientContext>
    );
    const view = render(renderDrawer(false));

    expect(languageClient.initializeMetricSession).not.toHaveBeenCalled();

    view.rerender(renderDrawer(true));
    await waitFor(() =>
      expect(languageClient.initializeMetricSession).toHaveBeenCalledOnce(),
    );
    const firstSessionId = vi.mocked(languageClient.initializeMetricSession)
      .mock.calls[0]![0].sessionId;

    view.rerender(renderDrawer(false));
    await waitFor(() =>
      expect(languageClient.killMetricSession).toHaveBeenCalledWith(
        firstSessionId,
      ),
    );

    view.rerender(renderDrawer(true));
    await waitFor(() =>
      expect(languageClient.initializeMetricSession).toHaveBeenCalledTimes(2),
    );
    const secondSessionId = vi.mocked(languageClient.initializeMetricSession)
      .mock.calls[1]![0].sessionId;

    expect(secondSessionId).not.toBe(firstSessionId);
  });
});
