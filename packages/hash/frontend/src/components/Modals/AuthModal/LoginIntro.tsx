import React, { useRef, VoidFunctionComponent } from "react";
import { useEffect, useState } from "react";
import { tw } from "twind";

import Logo from "../../../assets/svg/logo.svg";
import { IconHash } from "../../Icons/IconHash/IconHash";
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

type LoginIntroProps = {
  requestLoginCode: (x: string) => void;
  errorMessage?: string;
  loading: boolean;
  navigateToSignup: () => void;
};

export const LoginIntro: VoidFunctionComponent<LoginIntroProps> = ({
  requestLoginCode,
  errorMessage,
  loading,
  navigateToSignup,
}) => {
  const [emailOrShortname, setEmailOrShortname] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void requestLoginCode(emailOrShortname);
  };

  return (
    <div className={tw`w-full flex justify-center`}>
      <div className={tw`w-5/12 max-w-xl mr-28`}>
        <Logo className={tw`mb-6`} />
        <div className={tw`py-14 px-16 mb-9 rounded-2xl bg-white shadow-xl`}>
          <h1 className={tw`text-2xl font-black uppercase mb-10`}>
            Sign in to your account
          </h1>
          <form className={tw`flex mb-4 relative`} onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              className={tw`appearance-none border-b-2 focus:border-blue-500 w-full py-2 pl-1 pr-24 text-gray-700 leading-tight focus:outline-none focus:shadow-outline`}
              type="email"
              value={emailOrShortname}
              onChange={({ target }) => setEmailOrShortname(target.value)}
              placeholder="Enter your email or shortname"
            />

            <button
              className={tw`absolute right-0 top-1/2 -translate-y-1/2 flex items-center disabled:opacity-50 text-blue-500 hover:text-blue-700 font-bold py-2 px-2`}
              disabled={loading}
              type="submit"
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
      <div className={tw`w-3/12 max-w-sm`}>
        <p className={tw`mb-3.5`}>
          <strong>No account?</strong> No problem
        </p>
        <button
          className={tw`bg-black bg-opacity-70 hover:bg-opacity-90 rounded-lg h-11 px-6 flex items-center text-white mb-10`}
          onClick={navigateToSignup}
        >
          Create a free account
        </button>

        <div className={tw`invisible`}>
          <p className={tw`mb-3.5`}>
            If you use SSO, or have previously linked your account to a
            third-party you can sign in with them
          </p>
          <div className={tw`flex flex-wrap`}>
            {options.map(({ label }, index) => (
              <button
                className={tw`px-5 h-11 flex items-center bg-white border-1 border-gray-300 hover:border-gray-500 rounded-lg text-sm font-bold mr-2.5 mb-2 `}
                key={index}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
