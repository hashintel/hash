import React from "react";
import { render } from "../../tests/testUtils";
import { Button } from "./Button";

describe("Button", () => {
  it("should render", () => {
    const { getByText } = render(<Button>Test button</Button>);
    expect(getByText("Test button")).toBeVisible();
  });
});
