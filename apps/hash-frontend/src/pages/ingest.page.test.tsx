/**
 * @vitest-environment jsdom
 */
import { act, createElement, Fragment, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import IngestPage from "./ingest.page";
import type {
  IngestResumeOutcome,
  IngestRunState,
} from "./ingest.page/use-ingest-run";

const mockUseRouter = vi.fn();
const mockUseIngestRun = vi.fn();
const React = { Fragment, act, createElement };

Reflect.set(globalThis, "React", React);
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

vi.mock("next/router", () => ({
  useRouter: () => mockUseRouter(),
}));

vi.mock("@hashintel/design-system", () => ({
  InfinityLightIcon: () => null,
}));

vi.mock("@mui/material", () => ({
  Box: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Container: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  FormControlLabel: ({ label }: { label?: ReactNode }) => (
    <label>{label}</label>
  ),
  Radio: () => <input type="radio" readOnly />,
  RadioGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Tooltip: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Typography: ({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock("../shared/layout", () => ({
  getLayoutWithSidebar: vi.fn((page: ReactNode) => page),
}));

vi.mock("../shared/workers-header", () => ({
  WorkersHeader: () => null,
}));

vi.mock("./ingest.page/upload-panel", () => ({
  UploadPanel: ({ onReset }: { onReset: () => void }) => (
    <button type="button" onClick={onReset}>
      Reset ingest
    </button>
  ),
}));

vi.mock("./ingest.page/use-ingest-run", () => ({
  useIngestRun: () => mockUseIngestRun(),
}));

type RouterMock = {
  isReady: boolean;
  query: Record<string, string | string[] | undefined>;
  push: ReturnType<typeof vi.fn>;
  replace: ReturnType<typeof vi.fn>;
};

type HookMock = {
  state: IngestRunState;
  upload: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn<(_: string) => Promise<IngestResumeOutcome>>>;
};

const createRouterMock = (overrides: Partial<RouterMock> = {}): RouterMock => ({
  isReady: true,
  query: {},
  push: vi.fn(),
  replace: vi.fn(),
  ...overrides,
});

const createHookMock = (overrides: Partial<HookMock> = {}): HookMock => ({
  state: { phase: "idle" },
  upload: vi.fn(),
  reset: vi.fn(),
  resume: vi.fn(() => Promise.resolve("loaded")),
  ...overrides,
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const flushEffects = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const renderPage = ({
  router = createRouterMock(),
  hook = createHookMock(),
}: {
  router?: RouterMock;
  hook?: HookMock;
} = {}) => {
  mockUseRouter.mockReturnValue(router);
  mockUseIngestRun.mockReturnValue(hook);

  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(<IngestPage />);
  });

  return { router, hook };
};

describe("IngestPage navigation", () => {
  beforeEach(() => {
    mockUseRouter.mockReset();
    mockUseIngestRun.mockReset();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("clears the URL when resume discovers a missing run", async () => {
    const { router, hook } = renderPage({
      router: createRouterMock({
        isReady: true,
        query: { runId: "missing-run" },
      }),
      hook: createHookMock({
        resume: vi.fn(() => Promise.resolve("cleared-missing-run")),
      }),
    });

    await flushEffects();

    expect(hook.resume).toHaveBeenCalledWith("missing-run");
    expect(router.replace).toHaveBeenCalledWith("/ingest", undefined, {
      shallow: true,
    });
  });

  it("does not clear the URL when resume is superseded or fails", async () => {
    const superseded = renderPage({
      router: createRouterMock({
        isReady: true,
        query: { runId: "run-123" },
      }),
      hook: createHookMock({
        resume: vi.fn(() => Promise.resolve("superseded")),
      }),
    });

    await flushEffects();

    expect(superseded.hook.resume).toHaveBeenCalledWith("run-123");
    expect(superseded.router.replace).not.toHaveBeenCalled();
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;

    const failed = renderPage({
      router: createRouterMock({
        isReady: true,
        query: { runId: "run-456" },
      }),
      hook: createHookMock({
        resume: vi.fn(() => Promise.resolve("failed")),
      }),
    });

    await flushEffects();

    expect(failed.hook.resume).toHaveBeenCalledWith("run-456");
    expect(failed.router.replace).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "failed run",
      state: {
        phase: "done",
        runStatus: {
          runId: "run-789",
          status: "failed",
          error: "pipeline failed",
        },
      } as const satisfies IngestRunState,
    },
    {
      name: "error state",
      state: {
        phase: "error",
        message: "Lost connection to progress stream",
      } as const satisfies IngestRunState,
    },
  ])("cleans a stale runId on reset from $name", async ({ state }) => {
    const { router, hook } = renderPage({
      router: createRouterMock({
        isReady: false,
        query: { runId: "run-789" },
      }),
      hook: createHookMock({ state }),
    });

    const button = container?.querySelector("button");

    if (!button) {
      throw new Error("Expected the mocked UploadPanel reset button");
    }

    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await flushEffects();

    expect(hook.reset).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/ingest", undefined, {
      shallow: true,
    });
  });

  it("pushes results when the ingest state succeeds", async () => {
    const { router } = renderPage({
      router: createRouterMock({ isReady: true, query: {} }),
      hook: createHookMock({
        state: {
          phase: "done",
          runStatus: {
            runId: "run-999",
            status: "succeeded",
          },
        },
      }),
    });

    await flushEffects();

    expect(router.push).toHaveBeenCalledWith("/ingest/results?runId=run-999");
  });
});
