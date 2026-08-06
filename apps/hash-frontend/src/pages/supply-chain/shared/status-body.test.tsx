// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StatusBody } from "./status-body";

import type { EntityId } from "@blockprotocol/type-system";

vi.mock("../../../components/hooks/use-users", () => ({
  useUsers: () => ({
    users: [
      {
        displayName: "Alex Rivera",
        shortname: "arivera",
        entity: { metadata: { recordId: { entityId: "web~alex" } } },
      },
    ],
  }),
}));

describe("StatusBody", () => {
  afterEach(cleanup);

  it("renders resolved user mentions and multiline text", () => {
    render(
      <p>
        <StatusBody
          tokens={[
            { tokenType: "text", text: "Ask " },
            {
              tokenType: "mention",
              mentionType: "user",
              entityId: "web~alex" as EntityId,
            },
            { tokenType: "hardBreak" },
            { tokenType: "text", text: "today" },
          ]}
        />
      </p>,
    );

    expect(
      screen.getByRole("link", { name: "@arivera" }).getAttribute("href"),
    ).toBe("/@arivera");
    expect(screen.getByText("today")).toBeTruthy();
  });
});
