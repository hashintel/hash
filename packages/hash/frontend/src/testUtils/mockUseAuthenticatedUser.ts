import { AuthenticatedUser } from "../lib/user";
import {
  useAuthenticatedUser,
  useAuthInfo,
} from "../pages/shared/auth-info-context";

const mockedAuthenticatedUser: AuthenticatedUser = {
  kind: "user",
  entityEditionId: {
    baseId: "%",
    version: "",
  },
  userAccountId: "",
  accountSignupComplete: true,
  shortname: "test",
  preferredName: "Test",
  isInstanceAdmin: false,
  emails: [],
  memberOf: [],
};

jest.mock("../pages/shared/auth-info-context.ts", () => ({
  useAuthenticatedUser: jest.fn<ReturnType<typeof useAuthenticatedUser>, []>(
    () => ({
      authenticatedUser: mockedAuthenticatedUser,
      refetch: jest.fn(),
    }),
  ),
  useAuthInfo: jest.fn<ReturnType<typeof useAuthInfo>, []>(() => ({
    authenticatedUser: mockedAuthenticatedUser,
    refetch: jest.fn(),
  })),
}));
