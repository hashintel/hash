/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import {
  DEFAULT_LANGUAGE_CLIENT_CONTEXT,
  LanguageClientContext,
} from "../../../../../react/lsp/context";
import { ExperimentalIconProvider } from "../../../../experimental-icons";
import { DiagnosticsIndicator } from "./diagnostics-indicator";

afterEach(cleanup);

it("keeps one animated icon as live diagnostics change severity", () => {
  const onClick = vi.fn();
  const indicator = (total: number, errors: number, enabled = true) => (
    <ExperimentalIconProvider enabled={enabled} motion="none">
      <LanguageClientContext
        value={{
          ...DEFAULT_LANGUAGE_CLIENT_CONTEXT,
          totalDiagnosticsCount: total,
          errorDiagnosticsCount: errors,
        }}
      >
        <DiagnosticsIndicator onClick={onClick} isExpanded={false} />
      </LanguageClientContext>
    </ExperimentalIconProvider>
  );
  const { rerender } = render(indicator(0, 0));
  const icon = screen
    .getByRole("button", { name: "No diagnostic issues" })
    .querySelector("svg");
  expect(icon?.getAttribute("data-icon-status")).toBe("valid");
  const strokes = Array.from(icon?.querySelectorAll("path") ?? []);
  expect(strokes).toHaveLength(2);

  rerender(indicator(2, 1));
  const errorButton = screen.getByRole("button", {
    name: "2 diagnostic issues found",
  });
  expect(errorButton.querySelector("svg")).toBe(icon);
  expect(icon?.getAttribute("data-icon-status")).toBe("error");
  expect(Array.from(icon?.querySelectorAll("path") ?? [])).toEqual(strokes);
  const countWindow = errorButton.querySelector<HTMLElement>(
    "[data-diagnostic-count]",
  );
  const count = countWindow?.firstElementChild;
  expect(screen.getByText("2")).toBeTruthy();
  fireEvent.click(errorButton);
  expect(onClick).toHaveBeenCalledOnce();

  rerender(indicator(1, 0));
  expect(icon?.getAttribute("data-icon-status")).toBe("warning");
  expect(Array.from(icon?.querySelectorAll("path") ?? [])).toEqual(strokes);
  expect(countWindow?.firstElementChild).toBe(count);
  expect(screen.queryByText("2")).toBeNull();

  rerender(indicator(0, 0));
  expect(
    screen
      .getByRole("button", { name: "No diagnostic issues" })
      .querySelector("svg"),
  ).toBe(icon);
  expect(icon?.getAttribute("data-icon-status")).toBe("valid");
  expect(Array.from(icon?.querySelectorAll("path") ?? [])).toEqual(strokes);
  for (const stroke of strokes) {
    expect(stroke.style.opacity).toBe("");
    expect(stroke.style.transition).toBe("none");
  }
  expect(count?.textContent).toBe("1");
  expect(countWindow?.getAttribute("aria-hidden")).toBe("true");
  expect(countWindow?.style.width).toBe("0px");
  expect(countWindow?.style.transition).toBe("none");

  rerender(indicator(12, 1));
  expect(countWindow?.firstElementChild).toBe(count);
  expect(count?.textContent).toBe("12");
  expect(
    screen.getByRole("button", { name: "12 diagnostic issues found" }),
  ).toBe(errorButton);

  rerender(indicator(1, 1, false));
  expect(
    screen
      .getByRole("button", { name: "1 diagnostic issues found" })
      .querySelector("svg")
      ?.hasAttribute("data-icon-pack"),
  ).toBe(false);
});
