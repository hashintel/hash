import { VFC } from "react";
import { tw } from "twind";

import Logo from "../../../assets/svg/logo.svg";
import IconInfo from "../../Icons/IconInfo/IconInfo";

type AccountSetupProps = {
    navigateForward: () => void;
}

export const AccountSetup: VFC<AccountSetupProps> = ({ navigateForward }) => {
  return (
    <div className={tw`w-9/12 max-w-3xl`}>
      <Logo className={tw`mb-16`} />
      <div className={tw`mb-9`}>
        <h1 className={tw`text-3xl font-bold mb-4`}>
          Thanks for confirming your account
        </h1>
        <p className={tw`text-2xl mb-14 font-light`}>
          Now it's time to choose a username...
        </p>

        <form>
          <div className={tw`mb-8`}>
            <label className={tw`block font-bold uppercase mb-2`}>
              Personal Username
            </label>
            <p className={tw`text-sm text-black text-opacity-60 mb-5`}>
              Your own personal graph will exist under this username. e.g.
              https://hash.ai/
              <strong className={tw`text-black text-opacity-100`}>
                @example
              </strong>
            </p>
            <div className={tw`flex items-center`}>
              <div className={`relative`}>
                <input
                  className={tw`w-64 border-1 border-gray-300 focus:outline-none focus:border-blue-500 rounded-lg h-11 py-4 pl-6 pr-5 mr-7`}
                  placeholder="example"
                />
                <span className={tw`absolute left-2 top-1/2 -translate-y-1/2`}>@</span>
              </div>
              <div
                className={tw`max-w-sm flex-1 flex items-center border-1 border-blue-300 rounded-md px-3.5 py-3`}
              >
                <IconInfo className={tw`h-6 w-6 mr-3`} />
                <span className={tw`flex-1 text-black text-opacity-60 text-sm`}>
                  If you’re using HASH for work or a team, you’ll be able to
                  choose a separate org username later.
                </span>
              </div>
            </div>
          </div>
          <div className={tw`mb-14`}>
            <label className={tw`block font-bold uppercase mb-2`}>
              Preferred name{" "}
              <span className={tw`font-normal`}>or first name</span>
            </label>
            <p className={tw`text-sm text-black text-opacity-60 mb-5`}>
              What shall we call you when referring to you? e.g. “Hi,{" "}
              <strong className={tw`text-black text-opacity-100`}>Bobby</strong>
              ”
            </p>
            <input
              className={tw`w-64 border-1 border-gray-300 focus:outline-none focus:border-blue-500 rounded-lg h-11 py-4 px-5`}
              placeholder="Bobby"
            />
          </div>

          <button
            className={tw`group w-64 bg-gradient-to-r from-blue-400 via-blue-500 to-pink-500 rounded-lg h-11 flex items-center justify-center text-white text-sm font-bold`}
          >
            Continue{" "}
            <span className={tw`ml-2 transition-all group-hover:translate-x-1`}>
              &rarr;
            </span>
          </button>
        </form>
      </div>
    </div>
  );
};
