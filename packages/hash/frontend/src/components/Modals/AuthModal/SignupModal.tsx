import { useEffect, useState, VFC } from "react";
import { useRouter } from "next/router";

import { SignupIntro } from "./SignupIntro";
import { VerifyCode } from "./VerifyCode";
import { AccountSetup } from "./AccountSetup";

import { AuthModalLayout, AuthModalLayoutProps } from "./AuthModalLayout";
import { useMutation } from "@apollo/client";
import {
  CreateUserMutation,
  CreateUserMutationVariables,
  UpdateUserMutation,
  UpdateUserMutationVariables,
  VerificationCodeMetadata,
  VerifyEmailMutation,
  VerifyEmailMutationVariables,
} from "../../../graphql/apiTypes.gen";
import {
  createUser as createUserMutation,
  updateUser as updateUserMutation,
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
  const [userId, setUserId] = useState<string | null>(null);
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
      onSignupComplete?.();
    },
    onError: ({ graphQLErrors }) => {
      graphQLErrors.forEach(({ message }) => {
        // const { code } = extensions as { code?: string };

        setErrorMessage(message);
      });
    },
  });

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
        return (
          <AccountSetup
            updateUserDetails={updateUserDetails}
            loading={updateUserLoading}
            errorMessage={errorMessage}
          />
        );

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
