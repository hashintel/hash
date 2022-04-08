import React, { useState, VFC } from "react";
import { tw } from "twind";

import { WayToUseHash } from "../../graphql/apiTypes.gen";
import { HumanGreetingIcon, PeopleIcon, SpinnerIcon } from "../../shared/icons";

type AccountUsageProps = {
  updateWayToUseHash: (usingHow: WayToUseHash) => void;
  loading: boolean;
  errorMessage: string;
};

const USAGE_OPTIONS = [
  {
    icon: <HumanGreetingIcon className={tw`mb-6 w-20 h-20`} />,
    title: "By myself",
    description: "Create a personal knowledge graph",
    value: WayToUseHash.ByThemselves,
  },
  {
    icon: <PeopleIcon className={tw`mb-6 w-20 h-20`} />,
    title: "With a team",
    description: "Share your graph in whole or part",
    value: WayToUseHash.WithATeam,
  },
] as const;

export const AccountUsage: VFC<AccountUsageProps> = ({
  updateWayToUseHash,
  loading,
  errorMessage,
}) => {
  const [activeOption, setActiveOption] = useState<WayToUseHash | undefined>();

  const onSubmit = () => {
    if (activeOption) {
      updateWayToUseHash(activeOption);
    }
  };

  return (
    <div className={tw`flex flex-col items-center`}>
      <h1 className={tw`text-3xl mb-14`}>How are you planning to use HASH?</h1>
      <div className={tw`flex justify-center mb-14`}>
        {USAGE_OPTIONS.map(({ title, description, icon, value }, index) => (
          <button
            key={value}
            className={tw`w-52 group relative focus:outline-none ${
              index === 0 ? "mr-8" : ""
            }`}
            onClick={() => setActiveOption(value)}
            type="button"
          >
            <div
              className={tw`flex flex(1 col) items-center bg-white border(1 gray-200) rounded-xl relative z-10 pt-8 pb-14 px-5 `}
            >
              {icon}
              <p className={tw`text-lg font-bold mb-4`}>{title}</p>
              <p>{description}</p>
            </div>

            <div
              className={tw`transition-opacity opacity-0 ${
                activeOption === value
                  ? "opacity-50"
                  : "group-focus:opacity-20 group-hover:opacity-10"
              } absolute -inset-0.5 bg-gradient-to-b from-blue-400 to-pink-500 filter blur`}
            />
          </button>
        ))}
      </div>
      {/* @todo use Button component */}
      <button
        type="submit"
        className={tw`group w-64 bg-gradient-to-r from-blue-400 via-blue-500 to-pink-500 rounded-lg h-11 transition-all disabled:opacity-50 flex items-center justify-center text-white text-sm font-bold mx-auto`}
        onClick={onSubmit}
        disabled={!activeOption || loading}
      >
        {loading ? (
          <SpinnerIcon className={tw`h-4 w-4 text-white animate-spin`} />
        ) : (
          <>
            <span>Continue</span>
            <span className={tw`ml-2 transition-all group-hover:translate-x-1`}>
              &rarr;
            </span>
          </>
        )}
      </button>
      {/* todo: style this properly */}
      <p>{errorMessage}</p>
    </div>
  );
};
