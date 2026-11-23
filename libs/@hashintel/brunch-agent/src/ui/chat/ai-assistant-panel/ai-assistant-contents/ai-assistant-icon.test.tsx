/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { HashIconProvider } from "@hashintel/ds-icons";

import { AiAssistantIcon } from "./ai-assistant-icon";

afterEach(cleanup);

it.each([false, true])(
  "keeps the assistant's accessible name with the icon pack enabled=%s",
  (enabled) => {
    render(
      <HashIconProvider enabled={enabled}>
        <AiAssistantIcon title="Assistant" />
      </HashIconProvider>,
    );

    expect(screen.getByRole("img", { name: "Assistant" })).not.toBeNull();
  },
);

it.each([false, true])(
  "hides an untitled assistant icon with the icon pack enabled=%s",
  (enabled) => {
    const { container } = render(
      <HashIconProvider enabled={enabled}>
        <AiAssistantIcon />
      </HashIconProvider>,
    );

    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(screen.queryByRole("img")).toBeNull();
  },
);
