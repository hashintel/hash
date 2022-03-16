import {
  createUser as createUserMutation,
  verifyEmail as verifyEmailMutation,
} from "../../graphql/queries/user.queries";

const newUser = {
  shortname: "tester",
  email: "test@example.com",
  verificationCode: "exhorted-focalising-fluidity-wingmen",
  verificationCodeMetadata: {
    id: "ec2ce5a9-7c95-4061-b3bd-39a258682439",
    createdAt: "2021-09-21T22:32:38.559Z",
  },
};

export const SIGNUP_MOCKS = [
  {
    request: {
      query: createUserMutation,
      variables: {
        email: newUser.email,
      },
    },
    result: jest.fn(() => ({
      data: {
        createUser: {
          ...newUser.verificationCodeMetadata,
        },
      },
    })),
  },
  {
    request: {
      query: verifyEmailMutation,
      variables: {
        verificationId: newUser.verificationCodeMetadata.id,
        verificationCode: newUser.verificationCode,
      },
    },
    result: jest.fn(() => ({
      data: {
        verifyEmail: {
          accountId: "xyz",
          entityId: "abc",
          properties: {
            shortname: null,
            emails: [{ address: newUser.email, primary: true, verify: true }],
          },
        },
      },
    })),
  },
] as const;
