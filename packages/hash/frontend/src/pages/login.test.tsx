import React from "react";

import { render, useMockRouter } from "../tests/testUtils";
import Login from "./login.page";

describe("Login page", () => {
  it("should render", () => {
    useMockRouter();
    const { getByText } = render(<Login />);
    expect(
      getByText("Sign in to your account", { exact: false })
    ).toBeVisible();
  });
});
