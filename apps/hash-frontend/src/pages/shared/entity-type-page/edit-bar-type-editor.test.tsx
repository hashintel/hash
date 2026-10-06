import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeOntologyTypeVersion } from "@blockprotocol/type-system";

import { EditBarTypeEditor } from "./edit-bar-type-editor";

import type { ReactNode } from "react";

const formState = vi.hoisted(() => ({
  dirtyFields: {} as Record<string, boolean>,
  isSubmitting: false,
}));

const confirmButton = vi.hoisted(() => ({ disabled: false }));

vi.mock("@hashintel/type-editor", () => ({
  useEntityTypeFormState: () => formState,
}));

vi.mock("@hashintel/design-system", () => ({
  FontAwesomeIcon: () => null,
}));

vi.mock("../../../shared/icons/svg", () => ({
  PencilSimpleLine: () => null,
}));

vi.mock("../shared/edit-bar-contents", () => ({
  EditBarCollapse: ({
    children,
    in: visible,
  }: {
    children: ReactNode;
    in: boolean;
  }) => (visible ? children : null),
  EditBarContainer: ({ children }: { children: ReactNode }) => children,
  EditBarContents: ({
    label,
    confirmButtonProps,
    discardButtonProps,
  }: {
    label: string;
    confirmButtonProps: { children: ReactNode; disabled: boolean };
    discardButtonProps: { children: ReactNode };
  }) => {
    confirmButton.disabled = confirmButtonProps.disabled;
    return (
      <>
        {label} {confirmButtonProps.children} {discardButtonProps.children}
      </>
    );
  },
  useFreezeScrollWhileTransitioning: () => null,
}));

const renderEditor = (isDraft: boolean, major = 1) =>
  renderToStaticMarkup(
    <EditBarTypeEditor
      currentVersion={makeOntologyTypeVersion({ major })}
      isDraft={isDraft}
      gentleErrorStyling={false}
      discardButtonProps={{}}
    />,
  );

describe("EditBarTypeEditor", () => {
  beforeEach(() => {
    formState.dirtyFields = {};
    confirmButton.disabled = false;
  });

  it("shows creation actions for a pristine draft at version one", () => {
    const markup = renderEditor(true);

    expect(markup).toContain("this type has not yet been created");
    expect(markup).toContain("Create");
    expect(markup).toContain("Discard this type");
  });

  it("shows update actions for an edited existing type at version one", () => {
    formState.dirtyFields = { title: true };

    const markup = renderEditor(false);

    expect(markup).toContain("Version 1 -&gt; 2");
    expect(markup).toContain("Publish update");
    expect(markup).toContain("Discard changes");
    expect(markup).not.toContain("this type has not yet been created");
  });

  it("hides the edit bar for a pristine existing type", () => {
    expect(renderEditor(false)).toBe("");
  });

  it("renders a pristine existing type at the maximum version", () => {
    expect(renderEditor(false, 4_294_967_295)).toBe("");
  });

  it("disables publishing an update at the maximum version", () => {
    formState.dirtyFields = { title: true };

    expect(renderEditor(false, 4_294_967_295)).toContain(
      "this type has reached the maximum version and cannot be updated",
    );
    expect(confirmButton.disabled).toBe(true);
  });

  it("allows publishing the last available version", () => {
    formState.dirtyFields = { title: true };

    expect(renderEditor(false, 4_294_967_294)).toContain(
      "Version 4294967294 -&gt; 4294967295",
    );
    expect(confirmButton.disabled).toBe(false);
  });
});
