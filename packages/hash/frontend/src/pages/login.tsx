import { ReactNode, useEffect, useState } from "react";
import { NextPage } from "next";
import { LoginModal } from "../components/Modals/Login/LoginModal";
import { useRouter } from "next/router";
import { ParsedUrlQueryInput } from "querystring";
import { ApolloError, useMutation } from "@apollo/client";
import {
  Mutation,
  MutationLoginWithLoginCodeArgs,
} from "../graphql/apiTypes.gen";
import { loginWithLoginCode as loginWithLoginCodeMutation } from "../graphql/queries/user.queries";

type ParsedLoginQuery = {
  loginId: string;
  loginCode: string;
};

const tbdIsParsedLoginQuery = (
  tbd: ParsedUrlQueryInput
): tbd is ParsedLoginQuery =>
  tbd.loginId !== undefined &&
  typeof tbd.loginId === "string" &&
  tbd.loginCode !== undefined &&
  typeof tbd.loginCode === "string";
const LoginPage: NextPage = () => {
  const router = useRouter();

  const [initialErrorMessage, setInitialErrorMessage] = useState<ReactNode>();

  const [loginWithLoginCode] = useMutation<
    Mutation,
    MutationLoginWithLoginCodeArgs
  >(loginWithLoginCodeMutation, {
    onCompleted: ({ loginWithLoginCode }) => {
      const user = loginWithLoginCode;
      console.log(user);
    },
    onError: ({ graphQLErrors }) =>
      graphQLErrors.forEach(({ extensions }) => {
        const { code } = extensions as { code?: string };

        if (code === "LOGIN_CODE_NOT_FOUND") {
          setInitialErrorMessage("An unexpected error occurred.");
        } else if (code === "MAX_ATTEMPTS") {
          setInitialErrorMessage(
            "You have exceeded the maximum number of attempts for this login code."
          );
        } else if (code === "EXPIRED") {
          setInitialErrorMessage("This login code has expired.");
        } else if (code === "INCORRECT") {
          setInitialErrorMessage("Incorrect login code.");
        } else {
          throw new ApolloError({ graphQLErrors });
        }
      }),
  });

  useEffect(() => {
    const { query } = router;

    if (tbdIsParsedLoginQuery(query)) {
      const { loginId, loginCode } = query;
      void loginWithLoginCode({ variables: { loginId, loginCode } });
    }
  }, [router, loginWithLoginCode]);

  return (
    <LoginModal
      initialErrorMessage={initialErrorMessage}
      show={true}
      close={() => undefined}
      onLoggedIn={() => router.push("/")}
    />
  );
};

export default LoginPage;
