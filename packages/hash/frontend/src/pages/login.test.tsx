import React from "react";

import { render } from "../tests/testUtils";
import { useMockRouter } from "../tests/useMockRouter";
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
