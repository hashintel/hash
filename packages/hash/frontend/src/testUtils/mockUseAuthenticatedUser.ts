import { useAuthenticatedUser } from "../components/hooks/useAuthenticatedUser";

jest.mock("../components/hooks/useAuthenticatedUser.ts", () => ({
  useAuthenticatedUser: jest.fn<ReturnType<typeof useAuthenticatedUser>, []>(
    () => ({
      authenticatedUser: {
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
      },
      kratosSession: {} as any,
      refetch: jest.fn(),
      loading: false,
    }),
  ),
}));
