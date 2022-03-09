import React, { useEffect, useState, useRef, VFC } from "react";
import { tw } from "twind";
import { useRouter } from "next/router";

import Logo from "../../../assets/svg/logo.svg";
import { SpinnerIcon } from "../../icons";
import { TextInput } from "../../forms/TextInput";
import { useUser } from "../../hooks/useUser";
import { InviteHeader } from "../InviteHeader";
import { InvitationInfo } from "../utils";
import { Link } from "../../Link";

type SignupIntroProps = {
  handleSubmit: (email: string) => void;
  loading: boolean;
  errorMessage: string;
  invitationInfo: InvitationInfo | null;
};

export const SignupIntro: VFC<SignupIntroProps> = ({
  handleSubmit,
  loading,
  errorMessage,
  invitationInfo,
}) => {
  const [email, setEmail] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useUser();
  const router = useRouter();

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    if (user?.accountSignupComplete) {
      void router.push(`/${user.accountId}`);
    }
  }, [user, router]);

  const onSubmit = (evt: React.FormEvent) => {
    evt.preventDefault();
    handleSubmit(email);
  };

  return (
    <div className={tw`flex flex-col items-center pt-24`}>
      {!!invitationInfo && <InviteHeader invitationInfo={invitationInfo} />}
      <div className={tw`mb-12 flex items-center`}>
        <Logo className={tw`mr-5`} />
        <h1 className={tw`text-2xl font-bold`}>Sign up</h1>
      </div>
      {/* Don't display until sign-up with Google and Github are supported
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
      */}
      <form
        className={tw`flex flex-col mb-14 w-64 items-center`}
        onSubmit={onSubmit}
      >
        <TextInput
          className={tw`w-64 mb-2`}
          placeholder="Enter your email address.."
          type="email"
          ref={inputRef}
          onChangeText={setEmail}
        />
        {errorMessage && (
          <span className={tw`text-red-500 text-sm mb-4 text-center`}>
            {errorMessage}
          </span>
        )}
        <button
          type="submit"
          className={tw`w-64 bg-white border-1 border(gray-300 hover:gray-500 focus:gray-500) focus:outline-none rounded-lg h-11 flex items-center justify-center text-sm font-bold`}
        >
          {loading ? (
            <SpinnerIcon className={tw`h-4 w-4 animate-spin`} />
          ) : (
            <span>Continue with email</span>
          )}
        </button>
      </form>
      <p className={tw`text-sm  md:whitespace-nowrap text-center`}>
        Alternatively if you already have a HASH account,{" "}
        {/* @todo convert this to LinkButton on page refactor */}
        <Link
          href={{
            pathname: "/login",
            query: router.query,
          }}
          noLinkStyle
        >
          <button type="button" className={tw`font-bold focus:outline-none`}>
            Click here to log in
          </button>
        </Link>
      </p>
    </div>
  );
};
