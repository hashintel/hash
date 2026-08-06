// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StatusBody } from "./status-body";

import type { EntityId } from "@blockprotocol/type-system";

describe("StatusBody", () => {
  afterEach(cleanup);

  it("renders resolved user mentions and multiline text", () => {
    render(
      <p>
        <StatusBody
          mentionedUsersByEntityId={
            new Map([
              [
                "web~alex" as EntityId,
                { displayName: "Alex Rivera", shortname: "arivera" },
              ],
            ])
          }
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

  it("preserves an unresolved mention's entity ID", () => {
    const entityId = "web~missing-user" as EntityId;
    render(
      <StatusBody
        mentionedUsersByEntityId={new Map()}
        tokens={[
          {
            entityId,
            mentionType: "user",
            tokenType: "mention",
          },
        ]}
      />,
    );

    expect(screen.getByText(`@${entityId}`)).toBeTruthy();
  });
});
