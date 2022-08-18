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
    expect(getByText("Create an account")).toBeVisible();
    expect(getByText("Sign up with email")).toBeVisible();
  });

  it("should accept a user's email and request verification code", async () => {
    mockUseRouter({
      route: "/login",
    });
    const { getByPlaceholderText } = render(<Signup />, {
      mocks: SIGNUP_MOCKS,
    });
    const email = "test@example.com";
    const input = getByPlaceholderText("Enter your email address", {
      exact: false,
    });
    fireEvent.change(input, { target: { value: email } });
    fireEvent.submit(input);
  });
});
