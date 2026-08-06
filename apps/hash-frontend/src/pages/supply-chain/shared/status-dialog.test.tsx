// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StatusDialog } from "./status-dialog";

import type { EntityId } from "@blockprotocol/type-system";
import type { ReactNode } from "react";

const authMocks = vi.hoisted(() => ({
  authenticatedUser: undefined as
    | {
        accountId: string;
        memberOf: Array<{
          org: {
            memberships: Array<{
              user: {
                accountId: string;
                displayName: string;
                entity: { metadata: { recordId: { entityId: EntityId } } };
                shortname: string;
              };
            }>;
            webId: string;
          };
        }>;
      }
    | undefined,
}));

vi.mock("@hashintel/ds-components", () => ({
  Button: ({
    "aria-label": ariaLabel,
    children,
    className,
    onClick,
    type,
  }: {
    "aria-label"?: string;
    children?: ReactNode;
    className?: string;
    onClick?: () => void;
    type?: "button" | "reset" | "submit";
  }) => (
    <button
      aria-label={ariaLabel}
      className={className}
      onClick={onClick}
      type={type === "submit" ? "submit" : "button"}
    >
      {children}
    </button>
  ),
  Select: ({
    htmlForId,
    items,
    onChange,
    value,
  }: {
    htmlForId: string;
    items: Array<{ value: string; text: string }>;
    onChange: (value: string) => void;
    value: string;
  }) => (
    <select
      id={htmlForId}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.text}
        </option>
      ))}
    </select>
  ),
  usePortalContainerRef: () => null,
}));

vi.mock("./telemetry", () => ({
  trackSupplyChainInteraction: vi.fn(),
}));

vi.mock("../../shared/auth-info-context", () => ({
  useAuthInfo: () => ({ authenticatedUser: authMocks.authenticatedUser }),
}));

vi.mock("../../../components/hooks/use-users", () => ({
  useUsers: () => ({ users: [] }),
}));

vi.mock("./status-dialog/status-editor", () => ({
  StatusEditor: ({
    members,
    onChange,
  }: {
    members: Array<{ displayName: string }>;
    onChange: (tokens: Array<{ tokenType: "text"; text: string }>) => void;
  }) => (
    <>
      <textarea
        aria-label="Status comment"
        onChange={(event) =>
          onChange([{ tokenType: "text", text: event.target.value }])
        }
      />
      {members.map((member) => (
        <span key={member.displayName}>{member.displayName}</span>
      ))}
    </>
  ),
}));

describe("StatusDialog", () => {
  afterEach(() => {
    cleanup();
    authMocks.authenticatedUser = undefined;
  });

  it("shows previous updates in chronological order", () => {
    render(
      <StatusDialog
        title="QA hold"
        entries={[
          {
            entityId: "web~later" as EntityId,
            at: "2026-02-02T12:00:00.000Z",
            user: "Later user",
            category: "Investigation update",
            text: "Later comment",
            tokens: [{ tokenType: "text", text: "Later comment" }],
          },
          {
            entityId: "web~earlier" as EntityId,
            at: "2026-01-01T12:00:00.000Z",
            user: "Earlier user",
            category: "Investigation started",
            text: "",
            tokens: [],
          },
        ]}
        inline
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const updates = screen.getAllByRole("article");
    expect(
      screen
        .getByRole("region", { name: "Previous status updates" })
        .getAttribute("tabindex"),
    ).toBe("0");
    expect(screen.getByRole<HTMLSelectElement>("combobox").value).toBe(
      "Investigation update",
    );
    expect(updates[0]?.textContent).toContain("Earlier user");
    expect(updates[0]?.textContent).toContain("(no comment)");
    expect(updates[1]?.textContent).toContain("Later comment");
  });

  it("uses the selected status and validates its required comment", () => {
    const onSave = vi.fn();
    render(
      <StatusDialog title="QA hold" inline onClose={vi.fn()} onSave={onSave} />,
    );
    expect(screen.queryByText("Previous updates")).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "Investigation concluded" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    expect(screen.getByText("Add a comment for this status.")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Issue resolved" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    expect(onSave).toHaveBeenCalledWith({
      category: "Investigation concluded",
      text: "Issue resolved",
      tokens: [{ tokenType: "text", text: "Issue resolved" }],
    });
  });

  it("does not offer the authenticated user as a mention option", () => {
    authMocks.authenticatedUser = {
      accountId: "current-user",
      memberOf: [
        {
          org: {
            memberships: [
              {
                user: {
                  accountId: "current-user",
                  displayName: "Current User",
                  entity: {
                    metadata: {
                      recordId: { entityId: "web~current" as EntityId },
                    },
                  },
                  shortname: "current",
                },
              },
              {
                user: {
                  accountId: "other-user",
                  displayName: "Other User",
                  entity: {
                    metadata: {
                      recordId: { entityId: "web~other" as EntityId },
                    },
                  },
                  shortname: "other",
                },
              },
            ],
            webId: "local",
          },
        },
      ],
    };

    render(
      <StatusDialog
        title="QA hold"
        inline
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.queryByText("Current User")).toBeNull();
    expect(screen.getByText("Other User")).toBeTruthy();
  });
});
