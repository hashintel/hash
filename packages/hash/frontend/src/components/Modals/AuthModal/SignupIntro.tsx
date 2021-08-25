import React, { useEffect, useState } from "react";
import { useRef, VFC } from "react";
import { tw } from "twind";

import GithubIcon from "../../../assets/svg/github.svg";
import GoogleIcon from "../../../assets/svg/google.svg";
import Logo from "../../../assets/svg/logo.svg";
import { IconSpinner } from "../../Icons/IconSpinner/IconSpinner";

type SignupIntroProps = {
  handleSubmit: (email: string) => void;
  loading: boolean;
  errorMessage: string;
};

export const SignupIntro: VFC<SignupIntroProps> = ({
  handleSubmit,
  loading,
  errorMessage,
}) => {
  const [email, setEmail] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const onSubmit = (evt: React.FormEvent) => {
    evt.preventDefault();
    handleSubmit(email);
  };

  return (
    <div className={tw`flex flex-col items-center w-80`}>
      <div className={tw`mb-12 flex items-center`}>
        <Logo className={tw`mr-5`} />
        <h1 className={tw`text-2xl font-bold`}>Sign up</h1>
      </div>
      <button
        className={tw`mb-2 w-64 bg-white border-1 border-gray-300 rounded-lg h-11 flex items-center justify-center text-sm font-bold`}
      >
        <GoogleIcon className={tw`mr-2`} />
        Continue with Google
      </button>
      <button
        className={tw`w-64 bg-white border-1 border-gray-300 rounded-lg h-11 flex items-center justify-center text-sm font-bold`}
      >
        <GithubIcon className={tw`mr-2`} />
        Continue with Github
      </button>
      <div className={tw`flex items-center w-full my-4`}>
        <div className={tw`flex-1 h-px bg-gray-200`} />
        <em className={tw`mx-2 text-gray-400`}>or</em>
        <div className={tw`flex-1 h-px bg-gray-200`} />
      </div>
      <form onSubmit={onSubmit}>
        <input
          placeholder="Enter your email address.."
          type="email"
          ref={inputRef}
          className={tw`w-64 bg-gray-100 border-1 border-gray-300 rounded-lg h-11 py-4 px-5 mb-2`}
          onChange={(evt) => setEmail(evt.target.value)}
        />
        <button
          className={tw`w-64 bg-white border-1 border-gray-300 rounded-lg h-11 flex items-center justify-center text-sm font-bold`}
        >
          {loading ? (
            <IconSpinner className={tw`h-4 w-4 animate-spin`} />
          ) : (
            <span>Continue with email</span>
          )}
        </button>
      </form>
    </div>
  );
};
