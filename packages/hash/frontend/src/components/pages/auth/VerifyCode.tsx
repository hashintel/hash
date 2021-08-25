import React, { VFC, useRef, useEffect, useCallback } from "react";
import { tw } from "twind";
import Logo from "../../../assets/svg/logo.svg";
import { IconHash } from "../../Icons/IconHash/IconHash";
import IconKeyboardReturn from "../../Icons/IconKeyboardReturn/IconKeyboardReturn";

type VerifyCodeProps = {
  code: string;
  setCode: (x: string) => void;
  goBack: () => void;
  loading: boolean;
  errorMessage?: string;
  loginIdentifier: string;
  handleSubmit: () => void;
  requestCode: () => void;
  requestCodeLoading: boolean;
};

const isShortname = (identifier: string) => !identifier.includes("@");

export const VerifyCode: VFC<VerifyCodeProps> = ({
  code,
  setCode,
  goBack,
  errorMessage,
  loginIdentifier,
  handleSubmit,
  loading,
  // requestCode,
  // requestCodeLoading,
}) => {
  // const [emailResent, setEmailResent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const isInputValid = useCallback(() => {
    const units = code.split("-");
    return units.length >= 4 && units?.[3].length > 0;
  }, [code]);

  const onSubmit = (evt: React.FormEvent) => {
    evt.preventDefault();
    void handleSubmit();
  };

  return (
    <div className={tw`w-8/12 max-w-4xl`}>
      <Logo className={tw`mb-6`} />
      <div
        className={tw`h-96 mb-9 rounded-2xl bg-white shadow-xl flex justify-center items-center text-center`}
      >
        <div className={tw`w-8/12`}>
          <p className={tw`font-bold`}>
            A verification code has been sent to{" "}
            <span>
              {isShortname(loginIdentifier)
                ? "your primary email address"
                : loginIdentifier}
            </span>
          </p>
          <p className={tw`mb-10`}>
            Click the link in this email or enter the verification phrase below
            to continue
          </p>
          <form className={tw`relative`} onSubmit={onSubmit}>
            <input
              className={tw`block border-b-1 border-gray-300 w-11/12 mx-auto mb-2 py-3 pl-3 pr-3 text-3xl text-center focus:outline-none focus:border-blue-500`}
              onChange={(evt) => setCode(evt.target.value)}
              value={code}
              ref={inputRef}
            />
            <button
              className={tw`absolute right-0 top-1/2 transition-all translate-x-3/4 -translate-y-1/2 flex items-center disabled:opacity-0 disabled:pointer-events-none text-blue-500 hover:text-blue-700 font-bold py-2 px-2`}
              disabled={!isInputValid() || loading}
            >
              <span className={tw`mr-1`}>Submit</span>
              {loading ? (
                <IconHash className={tw`h-4 w-4 animate-spin`} />
              ) : (
                <IconKeyboardReturn />
              )}
            </button>
          </form>
          {errorMessage && (
            <span className={tw`text-red-500 text-sm`}>{errorMessage}</span>
          )}
        </div>
      </div>
      <div className={tw`flex justify-between`}>
        <button
          className={tw`border-b-1 border-transparent hover:border-current`}
          onClick={goBack}
        >
          &larr; <span className={tw`ml-1`}>Try logging in another way</span>
        </button>
        {/* Temporarily remove resend email button
        <div className={tw`flex items-center`}>
          <span className={tw`mr-1`}>No email yet?</span>
          <button
            className={tw`text-blue-500 focus:text-blue-700 hover:text-blue-700 disabled:opacity-50 font-bold focus:outline-none flex items-center`}
            onClick={requestCode}
            disabled={!requestCodeLoading}
          >
            <span>Resend email</span>
            {!requestCodeLoading && (
              <IconHash className={tw`h-3 w-3 ml-1 animate-spin`} />
            )}
          </button>
        </div> */}
        {/* {emailResent ? (
          <div className={tw`flex items-center`}>
            <span className={tw`mr-1`}>No email yet?</span>
            <span className={tw`font-bold text-green-500`}>Email Resent</span>
          </div>
        ) : (
          <div className={tw`flex items-center`}>
            <span className={tw`mr-1`}>No email yet?</span>
            <button
              className={tw`text-blue-500 focus:text-blue-700 hover:text-blue-700 disabled:opacity-50 font-bold focus:outline-none flex items-center`}
              onClick={requestCode}
              disabled={!requestCodeLoading}
            >
              <span>Resend email</span>
              {!requestCodeLoading && (
                <IconHash className={tw`h-3 w-3 ml-1 animate-spin`} />
              )}
            </button>
          </div>
        )} */}
      </div>
    </div>
  );
};
