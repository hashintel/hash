import React, { useCallback, useRef, VoidFunctionComponent } from "react";
import { useRouter } from "next/router";
import { ParsedUrlQueryInput } from "querystring";
import { useEffect, useState } from "react";
import { tw } from "twind";

import { Modal, ModalProps } from "../Modal";
import { useLogin } from "../../hooks/useLogin";

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
    <Modal show={show} close={close}>
      <h1 className={tw`text-xl font-black uppercase mb-2`}>
        Sign in to your account
      </h1>
      <form
        className={tw`flex mb-4`}
        onSubmit={(event) => {
          event.preventDefault();
          void sendLoginCode({ variables: { emailOrShortname } });
        }}
      >
        <input
          ref={emailOrShortnameInputRef}
          className={tw`shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline`}
          type="text"
          value={emailOrShortname}
          onChange={({ target }) => setEmailOrShortname(target.value)}
          placeholder="Enter your email or shortname"
          disabled={loginCodeMetadata !== undefined}
        />
        {!loginCodeMetadata && (
          <button
            className={tw`ml-1 bg-blue-500 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded`}
            disabled={sendLoginCodeLoading || !emailOrShortnameIsValid}
            type="submit"
          >
            Submit
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
    </Modal>
  );
};
