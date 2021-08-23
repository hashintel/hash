import React, { useCallback, useRef, VoidFunctionComponent } from "react";
import { useRouter } from "next/router";
import { ParsedUrlQueryInput } from "querystring";
import { useEffect, useState } from "react";
import { tw } from "twind";

import { Modal, ModalProps } from "../Modal";
import { useLogin } from "../../hooks/useLogin";
import { AuthModal } from "../AuthModal";
import Logo from "../../../assets/svg/logo.svg";
import IconKeyboardReturn from "../../Icons/IconKeyboardReturn/IconKeyboardReturn";

const options = [
  {
    label: "Google",
  },
  {
    label: "Github",
  },
  {
    label: "Google",
  },
  {
    label: "Bitbucket",
  },
  {
    label: "Okta",
  },
];

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

type LoginModalProps = {
  onLoggedIn?: () => void;
} & Omit<ModalProps, "children">;

export const LoginModal: VoidFunctionComponent<LoginModalProps> = ({
  show,
  close,
  onLoggedIn,
}) => {
  const router = useRouter();
  const emailOrShortnameInputRef = useRef<HTMLInputElement>(null);
  const loginCodeInputRef = useRef<HTMLInputElement>(null);

  const [emailOrShortname, setEmailOrShortname] = useState<string>("");

  const [loginCode, setLoginCode] = useState<string>("");

  const resetForm = useCallback(() => {
    setEmailOrShortname("");
    setLoginCode("");

    if (emailOrShortnameInputRef.current) {
      emailOrShortnameInputRef.current.focus();
    }
  }, [emailOrShortnameInputRef]);

  const {
    loginCodeMetadata,
    loginWithLoginCode,
    loginWithLoginCodeLoading,
    sendLoginCode,
    sendLoginCodeLoading,
    errorMessage,
  } = useLogin({
    reset: resetForm,
    onLoggedIn,
    onIncorrectLoginCode: () => {
      if (loginCodeInputRef.current) loginCodeInputRef.current.select();
    },
  });

  useEffect(() => {
    if (show && emailOrShortnameInputRef.current) {
      emailOrShortnameInputRef.current.focus();
    }
  }, [emailOrShortnameInputRef, show]);

  useEffect(() => {
    if (loginCodeMetadata && loginCodeInputRef.current) {
      loginCodeInputRef.current.focus();
    }
  }, [loginCodeInputRef, loginCodeMetadata]);

  useEffect(() => {
    const { pathname, query } = router;

    if (pathname === "/login" && tbdIsParsedLoginQuery(query)) {
      const { loginId, loginCode } = query;
      void loginWithLoginCode({ variables: { loginId, loginCode } });
    }
  }, [router, loginWithLoginCode]);

  const emailOrShortnameIsValid = emailOrShortname !== "";

  const loginCodeIsValid = loginCode !== "";

  return (
    <AuthModal show={show} close={close}>
      <div className={tw`w-full flex justify-center`}>
        <div className={tw`w-5/12 max-w-xl mr-28`}>
          <Logo className={tw`mb-6`} />
          <div className={tw`py-14 px-16 mb-9 rounded-2xl bg-white shadow-xl`}>
            {/*  */}
            <h1 className={tw`text-2xl font-black uppercase mb-10`}>
              Sign in to your account
            </h1>
            <form
              className={tw`flex mb-4 relative`}
              onSubmit={(event) => {
                event.preventDefault();
                void sendLoginCode({ variables: { emailOrShortname } });
              }}
            >
              <input
                ref={emailOrShortnameInputRef}
                className={tw`appearance-none border-b-2 w-full py-2 pl-1 pr-24 text-gray-700 leading-tight focus:outline-none focus:shadow-outline`}
                type="text"
                value={emailOrShortname}
                onChange={({ target }) => setEmailOrShortname(target.value)}
                placeholder="Enter your email or shortname"
                disabled={loginCodeMetadata !== undefined}
              />
              {!loginCodeMetadata && (
                <button
                  className={tw`absolute right-0 top-1/2 -translate-y-1/2  flex disabled:opacity-50 text-blue-500 font-bold py-2 px-2`}
                  disabled={sendLoginCodeLoading || !emailOrShortnameIsValid}
                  type="submit"
                >
                  Submit <IconKeyboardReturn />
                </button>
              )}
            </form>
            {loginCodeMetadata && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void loginWithLoginCode({
                    variables: {
                      loginId: loginCodeMetadata.id,
                      loginCode,
                    },
                  });
                }}
              >
                <p className={tw`mb-2`}>
                  Please check your inbox for a temporary login code
                </p>
                <input
                  ref={loginCodeInputRef}
                  className={tw`mb-4 shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline`}
                  type="text"
                  value={loginCode}
                  onChange={({ target }) => setLoginCode(target.value)}
                  placeholder="Paste your login code"
                  disabled={loginWithLoginCodeLoading}
                />
                <div className={tw`flex justify-between`}>
                  <button
                    type="button"
                    className={tw`flex-grow mr-1 bg-gray-300 hover:bg-gray-400 text-gray-800 py-2 px-4 rounded`}
                    onClick={resetForm}
                  >
                    Cancel
                  </button>
                  <button
                    className={tw`flex-grow ml-1 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded`}
                    disabled={loginWithLoginCodeLoading || !loginCodeIsValid}
                    type="submit"
                  >
                    Login
                  </button>
                </div>
              </form>
            )}
            {errorMessage && <p>{errorMessage}</p>}
            {/*  */}
          </div>
        </div>
        <div className={tw`w-3/12 max-w-sm`}>
          <p className={tw`mb-3.5`}>
            <strong>No account?</strong> No problem
          </p>
          <button
            className={tw`bg-black bg-opacity-80 hover:bg-opacity-90 rounded-lg h-11 px-6 flex items-center text-white mb-10`}
          >
            Create a free account
          </button>

          <p className={tw`mb-3.5`}>
            If you use SSO, or have previously linked your account to a
            third-party you can sign in with them
          </p>
          <div className={tw`flex flex-wrap`}>
            {options.map(({ label }, index) => (
              <button
                className={tw`px-5 h-11 flex items-center bg-white border-1 border-gray-300 rounded-lg text-sm font-bold mr-2.5 mb-2 `}
                key={index}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </AuthModal>
  );
};
