import { useState } from "react";
import { ApolloError, useMutation } from "@apollo/client";

import {
  LoginCodeMetadata,
  LoginWithLoginCodeMutation,
  MutationLoginWithLoginCodeArgs,
  SendLoginCodeMutation,
  SendLoginCodeMutationVariables,
} from "../../graphql/apiTypes.gen";
import {
  sendLoginCode as sendLoginCodeMutation,
  loginWithLoginCode as loginWithLoginCodeMutation,
} from "../../graphql/queries/user.queries";

type useLoginProps = {
  reset: () => void;
  onLoggedIn?: () => void;
  onIncorrectLoginCode?: () => void;
};

export const useLogin = ({
  reset: resetCallback,
  onLoggedIn,
  onIncorrectLoginCode,
}: useLoginProps) => {
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [loginCodeMetadata, setLoginCodeMetadata] = useState<
    LoginCodeMetadata | undefined
  >();

  const reset = () => {
    setLoginCodeMetadata(undefined);
    resetCallback();
  };

  const [sendLoginCode, { loading: sendLoginCodeLoading }] = useMutation<
    SendLoginCodeMutation,
    SendLoginCodeMutationVariables
  >(sendLoginCodeMutation, {
    onCompleted: ({ sendLoginCode }) => {
      setErrorMessage(undefined);
      setLoginCodeMetadata(sendLoginCode);
    },
    onError: ({ graphQLErrors }) =>
      graphQLErrors.forEach(({ extensions, message }) => {
        const { code } = extensions as { code?: string };

        if (code === "NOT_FOUND") {
          setErrorMessage(message);
        } else {
          throw new ApolloError({ graphQLErrors });
        }
      }),
  });

  const [loginWithLoginCode, { loading: loginWithLoginCodeLoading }] =
    useMutation<LoginWithLoginCodeMutation, MutationLoginWithLoginCodeArgs>(
      loginWithLoginCodeMutation,
      {
        onCompleted: () => {
          if (onLoggedIn) onLoggedIn();
        },
        onError: ({ graphQLErrors }) =>
          graphQLErrors.forEach(({ extensions }) => {
            const { code } = extensions as { code?: string };

            if (code === "LOGIN_CODE_NOT_FOUND") {
              reset();
              setErrorMessage(
                "An unexpected error occurred, please try again."
              );
            } else if (code === "MAX_ATTEMPTS") {
              reset();
              setErrorMessage(
                "You have exceeded the maximum number of attempts for this login code, please try again."
              );
            } else if (code === "EXPIRED") {
              reset();
              setErrorMessage("This login code has expired, please try again.");
            } else if (code === "INCORRECT") {
              setErrorMessage("Incorrect, please try again.");
              if (onIncorrectLoginCode) onIncorrectLoginCode();
            } else {
              throw new ApolloError({ graphQLErrors });
            }
          }),
      }
    );

  return {
    sendLoginCode,
    sendLoginCodeLoading,
    loginCodeMetadata,
    loginWithLoginCode,
    loginWithLoginCodeLoading,
    errorMessage,
  };
};
