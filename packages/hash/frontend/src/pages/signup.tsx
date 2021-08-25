import { useEffect, useState } from "react";
import { NextPage } from "next";
import { useRouter } from "next/router";
import { useUser } from "../components/hooks/useUser";

import { SignupIntro } from "../components/pages/auth/signup/SignupIntro";
import { VerifyCode } from "../components/pages/auth/VerifyCode";
import { AccountSetup } from "../components/pages/auth/signup/AccountSetup";

import { useMutation } from "@apollo/client";
import {
  CreateUserMutation,
  CreateUserMutationVariables,
  UpdateUserMutation,
  UpdateUserMutationVariables,
  VerificationCodeMetadata,
  VerifyEmailMutation,
  VerifyEmailMutationVariables,
} from "../graphql/apiTypes.gen";
import {
  createUser as createUserMutation,
  updateUser as updateUserMutation,
  verifyEmail as verifyEmailMutation,
} from "../graphql/queries/user.queries";
import {
  AUTH_ERROR_CODES,
  isParsedAuthQuery,
} from "../components/pages/auth/utils";
import { AuthLayout } from "../components/layout/PageLayout/AuthLayout";

enum Screen {
  Intro,
  VerifyCode,
  AccountSetup,
}

const SignupPage: NextPage = () => {
  const { user, refetch } = useUser();
  const router = useRouter();

  const [activeScreen, setActiveScreen] = useState<Screen>(Screen.Intro);
  const [email, setEmail] = useState("");
  const [verificationCodeMetadata, setVerificationCodeMetadata] = useState<
    VerificationCodeMetadata | undefined
  >();
  const [verificationCode, setVerificationCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (
      user &&
      !user.accountSignupComplete &&
      activeScreen !== Screen.AccountSetup
    ) {
      setUserId(user.id);
      setActiveScreen(Screen.AccountSetup);
    }
  }, [activeScreen, user]);

  useEffect(() => {
    // If the user is logged in, and their account sign-up is complete...
    if (user && user.accountSignupComplete) {
      // ...redirect them to the homepage
      void router.push("/");
    }
  }, [user, router]);

  const [createUser, { loading: createUserLoading }] = useMutation<
    CreateUserMutation,
    CreateUserMutationVariables
  >(createUserMutation, {
    onCompleted: ({ createUser }) => {
      setErrorMessage("");
      setVerificationCodeMetadata(createUser);
      setActiveScreen(Screen.VerifyCode);
    },
    onError: ({ graphQLErrors }) => {
      graphQLErrors.forEach(({ extensions, message }) => {
        const { code } = extensions as { code?: keyof typeof AUTH_ERROR_CODES };
        if (code) {
          setErrorMessage(AUTH_ERROR_CODES[code]);
        } else {
          setErrorMessage(message);
        }
      });
    },
  });

  const [verifyEmail, { loading: verifyEmailLoading }] = useMutation<
    VerifyEmailMutation,
    VerifyEmailMutationVariables
  >(verifyEmailMutation, {
    onCompleted: ({ verifyEmail: data }) => {
      setErrorMessage("");
      setUserId(data.id);

      setActiveScreen(Screen.AccountSetup);
    },
    onError: ({ graphQLErrors }) => {
      graphQLErrors.forEach(({ extensions, message }) => {
        const { code } = extensions as { code?: keyof typeof AUTH_ERROR_CODES };
        if (code) {
          setErrorMessage(AUTH_ERROR_CODES[code]);
        } else {
          setErrorMessage(message);
        }
      });
    },
  });

  const [updateUser, { loading: updateUserLoading }] = useMutation<
    UpdateUserMutation,
    UpdateUserMutationVariables
  >(updateUserMutation, {
    onCompleted: ({}) => {
      void refetch();
      void router.push("/");
    },
    onError: ({ graphQLErrors }) => {
      graphQLErrors.forEach(({ message }) => {
        // const { code } = extensions as { code?: string };

        setErrorMessage(message);
      });
    },
  });

  useEffect(() => {
    const { pathname, query } = router;
    if (pathname === "/signup" && isParsedAuthQuery(query)) {
      const { verificationId, verificationCode } = query;
      setActiveScreen(Screen.VerifyCode);
      setVerificationCode(verificationCode);
      setTimeout(() => {
        void verifyEmail({
          variables: { verificationId, verificationCode },
        });
      }, 1000);
    }
  }, [router, verifyEmail]);

  const requestVerificationCode = (email: string) => {
    setEmail(email);
    void createUser({
      variables: { email },
    });
  };

  const handleVerifyEmail = () => {
    if (!verificationCodeMetadata) return;
    void verifyEmail({
      variables: {
        verificationId: verificationCodeMetadata?.id,
        verificationCode: verificationCode,
      },
    });
  };

  const updateUserDetails = (shortname: string, preferredName: string) => {
    if (!userId) return;
    void updateUser({
      variables: { id: userId, properties: { shortname, preferredName } },
    });
  };

  const goBack = () => {
    if (activeScreen === Screen.VerifyCode) {
      setActiveScreen(Screen.Intro);
    }
  };

  return (
    <AuthLayout>
      {activeScreen === Screen.Intro && (
        <SignupIntro
          loading={createUserLoading}
          errorMessage={errorMessage}
          handleSubmit={requestVerificationCode}
        />
      )}
      {activeScreen === Screen.VerifyCode && (
        <VerifyCode
          loginIdentifier={email}
          goBack={goBack}
          code={verificationCode}
          setCode={setVerificationCode}
          loading={verifyEmailLoading}
          handleSubmit={handleVerifyEmail}
          errorMessage={errorMessage}
          requestCodeLoading={false}
          requestCode={() => {}}
        />
      )}
      {activeScreen === Screen.AccountSetup && (
        <AccountSetup
          updateUserDetails={updateUserDetails}
          loading={updateUserLoading}
          errorMessage={errorMessage}
        />
      )}
    </AuthLayout>
  );
};

export default SignupPage;
