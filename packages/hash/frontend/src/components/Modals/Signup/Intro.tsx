import { tw } from "twind";

import GithubIcon from "../../../assets/svg/github.svg";
import GoogleIcon from "../../../assets/svg/google.svg";
import logo from "../../../assets/images/logo.png";

export const Intro = () => {
  return (
    <div className={tw`flex flex-col items-center w-80`}>
      <div className={tw`mb-12 flex items-center`}>
        <img src={logo} className={tw`h-7 mr-5`} />
        <h1 className={tw`text-2xl font-bold`}>Sign up</h1>
      </div>
      <button
        className={tw`mb-2 w-64 bg-white border-1 border-gray-300 rounded-lg h-11 flex items-center justify-center text-sm font-bold`}
      >
        <GoogleIcon className={tw`mr-2`} />
        Continue with Google
      </button>
      <button
        className={tw`mb-5 w-64 bg-white border-1 border-gray-300 rounded-lg h-11 flex items-center justify-center text-sm font-bold`}
      >
        <GithubIcon className={tw`mr-2`} />
        Continue with Github
      </button>
      <div className={tw`flex items-center w-full my-4`}>
        <div className={tw`flex-1 h-px bg-gray-200`}></div>
        <em className={tw`mx-2 text-gray-400`}>or</em>
        <div className={tw`flex-1 h-px bg-gray-200`}></div>
      </div>
      <input
        placeholder="Enter your email address.."
        className={tw`w-64 bg-gray-100 border-1 border-gray-300 rounded-lg h-11 py-4 px-5 mb-2`}
      />
      <button
        className={tw`w-64 bg-white border-1 border-gray-300 rounded-lg h-11 flex items-center justify-center text-sm font-bold`}
      >
        Continue with email
      </button>
    </div>
  );
};
