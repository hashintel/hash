import React, {
  ReactNode,
  useCallback,
  useRef,
  VoidFunctionComponent,
} from "react";
import { ApolloError, useMutation } from "@apollo/client";
import { useEffect, useState } from "react";
import { tw } from "twind";
import { Modal, ModalProps } from "../Modal";
import {
  LoginCodeMetadata,
  Mutation,
  MutationLoginWithLoginCodeArgs,
  SendLoginCodeMutationVariables,
} from "../../../graphql/apiTypes.gen";
import {
  sendLoginCode as sendLoginCodeMutation,
  loginWithLoginCode as loginWithLoginCodeMutation,
} from "../../../graphql/queries/user.queries";

type LoginModalProps = {
  initialErrorMessage?: ReactNode;
} & Omit<ModalProps, "children">;

export const LoginModal: VoidFunctionComponent<LoginModalProps> = ({
  initialErrorMessage,
  show,
  close,
}) => {
  const emailOrShortnameInputRef = useRef<HTMLInputElement>(null);
  const loginCodeInputRef = useRef<HTMLInputElement>(null);

  const [emailOrShortname, setEmailOrShortname] = useState<string>("");

  const [loginCode, setLoginCode] = useState<string>("");
  const [loginCodeMetadata, setLoginCodeMetadata] = useState<
    LoginCodeMetadata | undefined
  >();

  const [errorMessage, setErrorMessage] =
    useState<React.ReactNode>(initialErrorMessage);

  useEffect(() => {
    setErrorMessage(initialErrorMessage);
  }, [initialErrorMessage]);

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

  const [sendLoginCode, { loading: sendLoginCodeLoading }] = useMutation<
    Mutation,
    SendLoginCodeMutationVariables
  >(sendLoginCodeMutation, {
    onCompleted: (data) => {
      setErrorMessage(undefined);
      setLoginCodeMetadata(data?.sendLoginCode);
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

  const reset = useCallback(() => {
    setEmailOrShortname("");
    setLoginCode("");
    setLoginCodeMetadata(undefined);

    if (emailOrShortnameInputRef.current) {
      emailOrShortnameInputRef.current.focus();
    }
  }, [emailOrShortnameInputRef]);

  const [loginWithLoginCode, { loading: loginWithLoginCodeLoading }] =
    useMutation<Mutation, MutationLoginWithLoginCodeArgs>(
      loginWithLoginCodeMutation,
      {
        onCompleted: ({ loginWithLoginCode }) => {
          const user = loginWithLoginCode;
          console.log(user);
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
              if (loginCodeInputRef.current) loginCodeInputRef.current.select();
            } else {
              throw new ApolloError({ graphQLErrors });
            }
          }),
      }
    );

  const emailOrShortnameIsValid = emailOrShortname !== "";

  const loginCodeIsValid = loginCode !== "";

  return (
    <Modal show={show} close={close}>
      <h1 className={tw`text-xl font-black uppercase mb-2`}>
        Sign in to your account
      </h1>
      <form
        className={tw`flex mb-4`}
        onSubmit={(e) => {
          e.preventDefault();
          sendLoginCode({ variables: { emailOrShortname } });
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
          onSubmit={(e) => {
            e.preventDefault();
            loginWithLoginCode({
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
              onClick={reset}
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
