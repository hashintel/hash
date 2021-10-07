import React from "react";

import { render } from "../testUtils/testUtils";
import { mockUseRouter } from "../testUtils/mockUseRouter";
import Login from "./login.page";

describe("Login page", () => {
  it("should render", () => {
    mockUseRouter();
    const { getByText } = render(<Login />);
    expect(
      getByText("Sign in to your account", { exact: false })
    ).toBeVisible();
  });
});
