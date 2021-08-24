import React, { useEffect } from "react";
import { useMemo } from "react";
import { VFC, useRef } from "react";
import { tw } from "twind";
import Logo from "../../../assets/svg/logo.svg";

type VerifyCodeProps = {
  loginCode: string;
  setLoginCode: (x: string) => void;
  goBack: () => void;
  loading: boolean;
  errorMessage?: string;
  loginIdentifier: string;
  handleSubmit: () => void;
};

export const VerifyCode: VFC<VerifyCodeProps> = ({
  loginCode,
  setLoginCode,
  goBack,
  errorMessage,
  loginIdentifier,
  handleSubmit,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const isInputValid = useMemo(() => {
    const units = loginCode.split("-");
    return units.length == 4 && units?.[3].length > 0;
  }, [loginCode]);

  const handlePaste = () => {};

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
            A verification email has been sent to <span>{loginIdentifier}</span>
          </p>
          <p className={tw`mb-10`}>
            Click the link in this email or enter the verification phrase below
            to continue
          </p>
          <form onSubmit={onSubmit}>
            <input
              className={tw`block border-b-1 border-gray-300 w-11/12 mx-auto mb-2 py-3 px-5 text-3xl text-center focus:outline-none focus:border-blue-500`}
              onChange={(evt) => setLoginCode(evt.target.value)}
              value={loginCode}
              ref={inputRef}
              onPaste={handlePaste}
            />
            {errorMessage && (
              <span className={tw`text-red-500 text-sm`}>{errorMessage}</span>
            )}

            <button
              className={tw`w-64 h-11 mt-8 mx-auto bg-gradient-to-r from-blue-400 via-blue-500 to-pink-500 ${
                isInputValid ? "opacity-100" : "opacity-30 pointer-events-none"
              } rounded-lg flex items-center justify-center text-white font-bold`}
            >
              Submit
            </button>
          </form>
        </div>
      </div>
      <div className={tw`flex justify-between`}>
        <button
          className={tw`border-b-1 border-transparent hover:border-current`}
          onClick={goBack}
        >
          &larr; <span className={tw`ml-1`}>Try logging in another way</span>
        </button>

        <div className={tw`flex`}>
          <span className={tw`mr-1`}>No email yet?</span>
          <button
            className={tw`text-blue-500 focus:text-blue-700 hover:text-blue-700 font-bold  focus:outline-none`}
          >
            Resend email
          </button>
        </div>
      </div>
    </div>
  );
};
