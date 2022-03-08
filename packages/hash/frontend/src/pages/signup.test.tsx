import React from "react";
import { waitFor } from "@testing-library/dom";

import { mockUseRouter } from "../testUtils/mockUseRouter";
import { fireEvent, render } from "../testUtils/testUtils";
import { SIGNUP_MOCKS } from "./__mocks__/signup.mock";
import Signup from "./signup.page";

describe("Signup page", () => {
  it("should render", () => {
    mockUseRouter({
      route: "/",
    });
    const { getByText } = render(<Signup />);
    expect(getByText("Sign up")).toBeVisible();
    expect(getByText("Continue with email")).toBeVisible();
  });

  it("should accept a user's email and request verification code", async () => {
    mockUseRouter({
      route: "/login",
    });
    const { getByPlaceholderText, getByText, getByTestId } = render(
      <Signup />,
      { mocks: SIGNUP_MOCKS },
    );
    const email = "test@example.com";
    const input = getByPlaceholderText("Enter your email address", {
      exact: false,
    });
    fireEvent.change(input, { target: { value: email } });
    fireEvent.submit(input);
    await waitFor(() => expect(SIGNUP_MOCKS[0].result).toHaveBeenCalled());
    expect(getByText(email, { exact: false })).toBeVisible();
    expect(getByTestId("verify-code-input")).toBeInTheDocument();
  });
});
