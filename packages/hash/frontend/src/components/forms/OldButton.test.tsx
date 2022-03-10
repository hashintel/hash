import React from "react";
import { render } from "../../testUtils/testUtils";
import { OldButton } from "./OldButton";

describe("OldButton", () => {
  it("should render", () => {
    const { getByText } = render(<OldButton>Test button</OldButton>);
    expect(getByText("Test button")).toBeVisible();
  });
});
