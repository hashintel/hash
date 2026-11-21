/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_LANGUAGE_CLIENT_CONTEXT,
  LanguageClientContext,
} from "../../../../../../react/lsp/context";
import { useMetricLspSession } from "./use-metric-lsp-session";

const setup = () => {
  const client = {
    ...DEFAULT_LANGUAGE_CLIENT_CONTEXT,
    initializeMetricSession: vi.fn(),
    updateMetricSession: vi.fn(),
    killMetricSession: vi.fn(),
  };
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <LanguageClientContext value={client}>{children}</LanguageClientContext>
  );
  const mount = (code: string, sessionId?: string) =>
    renderHook(
      (props: { code: string }) => useMetricLspSession(props.code, sessionId),
      { initialProps: { code }, wrapper },
    );

  return { client, mount };
};

describe("useMetricLspSession", () => {
  it("starts a session on mount, updates it with the code and ends it on unmount", () => {
    const { client, mount } = setup();
    const { result, rerender, unmount } = mount("return 1;", "session-1");

    expect(result.current).toBe("session-1");
    expect(client.initializeMetricSession).toHaveBeenCalledExactlyOnceWith({
      sessionId: "session-1",
      code: "return 1;",
    });

    rerender({ code: "return 1;" });
    expect(client.updateMetricSession).not.toHaveBeenCalled();

    rerender({ code: "return 2;" });
    expect(client.updateMetricSession).toHaveBeenCalledExactlyOnceWith({
      sessionId: "session-1",
      code: "return 2;",
    });
    expect(client.initializeMetricSession).toHaveBeenCalledOnce();

    unmount();
    expect(client.killMetricSession).toHaveBeenCalledExactlyOnceWith(
      "session-1",
    );
  });

  it("gives each mount a session of its own when no id is given", () => {
    const { client, mount } = setup();
    const first = mount("return 1;");
    const firstSessionId = first.result.current;
    first.unmount();

    expect(client.killMetricSession).toHaveBeenCalledWith(firstSessionId);
    expect(mount("return 1;").result.current).not.toBe(firstSessionId);
  });
});
