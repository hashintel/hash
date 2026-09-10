/**
 * @vitest-environment jsdom
 *
 * The session follows the definition's content: a host that rebuilds an
 * equal state object every render (run-mode hosts do) must not re-sync the
 * worker, because every sync ends in a diagnostics publish that re-renders
 * the host — an identity-keyed sync looped for as long as the form showed.
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_LANGUAGE_CLIENT_CONTEXT,
  LanguageClientContext,
} from "../../../react/lsp/context";
import { useAdHocLspSession } from "./use-ad-hoc-lsp-session";

import type { AdHocScenarioState } from "@hashintel/petrinaut-core";

const stateWith = (expression: string): AdHocScenarioState => ({
  variables: [{ name: "load", type: "real", expression, optimize: null }],
  netParameters: [],
  places: {},
});

describe("useAdHocLspSession", () => {
  it("syncs the worker on content changes, never on state identity alone", () => {
    const client = {
      ...DEFAULT_LANGUAGE_CLIENT_CONTEXT,
      initializeAdHocSession: vi.fn(),
      updateAdHocSession: vi.fn(),
      killAdHocSession: vi.fn(),
    };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LanguageClientContext value={client}>{children}</LanguageClientContext>
    );
    const initial = stateWith("1");
    const { result, rerender, unmount } = renderHook(
      ({ state }: { state: AdHocScenarioState }) =>
        useAdHocLspSession(state, "session-1"),
      { initialProps: { state: initial }, wrapper },
    );

    expect(result.current).toBe("session-1");
    expect(client.initializeAdHocSession).toHaveBeenCalledTimes(1);
    expect(client.initializeAdHocSession).toHaveBeenCalledWith({
      sessionId: "session-1",
      state: initial,
    });

    rerender({ state: stateWith("1") });
    rerender({ state: stateWith("1") });
    expect(client.updateAdHocSession).not.toHaveBeenCalled();

    const edited = stateWith("2");
    rerender({ state: edited });
    expect(client.updateAdHocSession).toHaveBeenCalledTimes(1);
    expect(client.updateAdHocSession).toHaveBeenCalledWith({
      sessionId: "session-1",
      state: edited,
    });

    unmount();
    expect(client.killAdHocSession).toHaveBeenCalledWith("session-1");
  });
});
