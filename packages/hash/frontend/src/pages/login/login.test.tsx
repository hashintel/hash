import React from "react";

import { mockUseRouter } from "../../testUtils/mockUseRouter";
import { render } from "../../testUtils/testUtils";
import Login from "./index.page";

describe("Login page", () => {
  it("should render", () => {
    mockUseRouter();
    const { getByText } = render(<Login />);
    expect(
      getByText("Sign in to your account", { exact: false }),
    ).toBeVisible();
  });
});
