import {
  useEffect,
  useState,
  useRef,
  FunctionComponent,
  FormEvent,
} from "react";
import { useRouter } from "next/router";

import { LogoIcon, SpinnerIcon } from "../../shared/icons";
import { TextInput } from "../../components/forms/TextInput";
import { useAuthenticatedUser } from "../../components/hooks/useAuthenticatedUser";
import { InviteHeader } from "../shared/invite-header";
import { InvitationInfo } from "../shared/auth-utils";
import { Link } from "../../shared/ui";

type SignupIntroProps = {
  handleSubmit: (email: string) => void;
  loading: boolean;
  errorMessage: string;
  invitationInfo: InvitationInfo | null;
};

export const SignupIntro: FunctionComponent<SignupIntroProps> = ({
  handleSubmit,
  loading,
  errorMessage,
  invitationInfo,
}) => {
  const [email, setEmail] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { authenticatedUser } = useAuthenticatedUser();
  const router = useRouter();

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    if (authenticatedUser?.accountSignupComplete) {
      void router.push(`/${authenticatedUser.entityId}`);
    }
  }, [authenticatedUser, router]);

  const onSubmit = (evt: FormEvent) => {
    evt.preventDefault();
    handleSubmit(email);
  };

  return (
    <div style={tw`flex flex-col items-center pt-24`}>
      {!!invitationInfo && <InviteHeader invitationInfo={invitationInfo} />}
      <div style={tw`mb-12 flex items-center`}>
        <LogoIcon style={tw`mr-5`} />
        <h1 style={tw`text-2xl font-bold`}>Sign up</h1>
      </div>
      {/* Don't display until sign-up with Google and Github are supported
      <button
        style={tw`mb-2 w-64 bg-white border-1 border-gray-300 rounded-lg h-11 flex items-center justify-center text-sm font-bold`}
      >
        <GoogleIcon style={tw`mr-2`} />
        Continue with Google
      </button>
      <button
        style={tw`w-64 bg-white border-1 border-gray-300 rounded-lg h-11 flex items-center justify-center text-sm font-bold`}
      >
        <GithubIcon style={tw`mr-2`} />
        Continue with Github
      </button>
      <div style={tw`flex items-center w-full my-4`}>
        <div style={tw`flex-1 h-px bg-gray-200`} />
        <em style={tw`mx-2 text-gray-400`}>or</em>
        <div style={tw`flex-1 h-px bg-gray-200`} />
      </div>
      */}
      <form
        style={tw`flex flex-col mb-14 w-64 items-center`}
        onSubmit={onSubmit}
      >
        <TextInput
          style={tw`w-64 mb-2`}
          placeholder="Enter your email address.."
          type="email"
          ref={inputRef}
          onChangeText={setEmail}
        />
        {errorMessage && (
          <span style={tw`text-red-500 text-sm mb-4 text-center`}>
            {errorMessage}
          </span>
        )}
        <button
          type="submit"
          style={tw`w-64 cursor-pointer bg-white border-1 border(solid gray-300 hover:gray-500 focus:gray-500) focus:outline-none rounded-lg h-11 flex items-center justify-center text-sm font-bold`}
        >
          {loading ? (
            <SpinnerIcon style={tw`h-4 w-4 animate-spin`} />
          ) : (
            <span>Continue with email</span>
          )}
        </button>
      </form>
      <p style={tw`text-sm  md:whitespace-nowrap text-center`}>
        Alternatively if you already have a HASH account,{" "}
        {/* @todo convert this to LinkButton on page refactor */}
        <Link
          href={{
            pathname: "/login",
            query: router.query,
          }}
          noLinkStyle
        >
          <button
            type="button"
            style={tw`bg-transparent border-none cursor-pointer font-bold focus:outline-none`}
          >
            Click here to log in
          </button>
        </Link>
      </p>
    </div>
  );
};
