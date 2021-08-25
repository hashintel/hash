import { useEffect, useState, VFC } from "react";
import { useRouter } from "next/router";

import { SignupIntro } from "./SignupIntro";
import { VerifyCode } from "./VerifyCode";
import { AccountSetup } from "./AccountSetup";

import { AuthModalLayout, AuthModalLayoutProps } from "./AuthModalLayout";
import { ApolloError, useMutation } from "@apollo/client";
import {
  CreateUserMutation,
  CreateUserMutationVariables,
  VerificationCodeMetadata,
  VerifyEmailMutation,
  VerifyEmailMutationVariables,
} from "../../../graphql/apiTypes.gen";
import {
  createUser as createUserMutation,
  verifyEmail as verifyEmailMutation,
} from "../../../graphql/queries/user.queries";
import { AUTH_ERROR_CODES, isParsedAuthQuery } from "./utils";

type SignupModalProps = {
  onSignupComplete: () => void;
} & Omit<AuthModalLayoutProps, "children">;

enum Screen {
  Intro,
  VerifyCode,
  AccountSetup,
}

export const SignupModal: VFC<SignupModalProps> = ({
  show,
  close,
  onSignupComplete,
  closeIconHidden,
}) => {
  const [activeScreen, setActiveScreen] = useState<Screen>(Screen.Intro);
  const [email, setEmail] = useState("");
  const [verificationCodeMetadata, setVerificationCodeMetadata] = useState<
    VerificationCodeMetadata | undefined
  >();
  const [verificationCode, setVerificationCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

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
      graphQLErrors.forEach(({ extensions }) => {
        const { code } = extensions as { code?: keyof typeof AUTH_ERROR_CODES };
        if (code) {
          setErrorMessage(AUTH_ERROR_CODES[code]);
        } else {
          throw new ApolloError({ graphQLErrors });
        }
      });
    },
  });

  const [verifyEmail, { loading: verifyEmailLoading }] = useMutation<
    VerifyEmailMutation,
    VerifyEmailMutationVariables
  >(verifyEmailMutation, {
    onCompleted: ({}) => {
      setErrorMessage("");
      onSignupComplete?.();
    },
    onError: ({ graphQLErrors }) => {
      graphQLErrors.forEach(({ extensions }) => {
        const { code } = extensions as { code?: keyof typeof AUTH_ERROR_CODES };
        if (code) {
          setErrorMessage(AUTH_ERROR_CODES[code]);
        } else {
          // Probably set a generic error message here
        }
      });
    },
  });

  const requestVerificationCode = (email: string) => {
    setEmail(email);
    void createUser({
      variables: { email },
    });
  };

  useEffect(() => {
    if (!show && activeScreen !== Screen.Intro) {
      setActiveScreen(Screen.Intro);
    }
  }, [show, activeScreen]);

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

  const handleVerifyEmail = () => {
    if (!verificationCodeMetadata) return;
    void verifyEmail({
      variables: {
        verificationId: verificationCodeMetadata?.id,
        verificationCode: verificationCode,
      },
    });
  };

  const renderContent = () => {
    switch (activeScreen) {
      case Screen.VerifyCode:
        return (
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
        );

      case Screen.AccountSetup:
        return <AccountSetup />;

      case Screen.Intro:
      default:
        return (
          <SignupIntro
            loading={createUserLoading}
            errorMessage={errorMessage}
            handleSubmit={requestVerificationCode}
          />
        );
    }
  };

  const goBack = () => {
    if (activeScreen === Screen.VerifyCode) {
      setActiveScreen(Screen.Intro);
    }
  };

  return (
    <AuthModalLayout
      show={show}
      close={close}
      closeIconHidden={closeIconHidden}
    >
      {renderContent()}
    </AuthModalLayout>
  );
};
