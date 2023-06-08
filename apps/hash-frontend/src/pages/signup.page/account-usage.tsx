import { FunctionComponent, useState } from "react";

import { HumanGreetingIcon, PeopleIcon, SpinnerIcon } from "../../shared/icons";

type WayToUseHash = "BY_THEMSELVES" | "WITH_A_TEAM";

type AccountUsageProps = {
  updateWayToUseHash: (usingHow: WayToUseHash) => void;
  loading: boolean;
  errorMessage: string;
};

const USAGE_OPTIONS = [
  {
    icon: (
      <HumanGreetingIcon
        style={{ marginBottom: "1.5rem", width: "5rem", height: "5rem" }}
      />
    ),
    title: "By myself",
    description: "Create a personal knowledge graph",
    value: "BY_THEMSELVES",
  },
  {
    icon: (
      <PeopleIcon
        style={{ marginBottom: "1.5rem", width: "5rem", height: "5rem" }}
      />
    ),
    title: "With a team",
    description: "Share your graph in whole or part",
    value: "BY_THEMSELVES",
  },
] as const;

export const AccountUsage: FunctionComponent<AccountUsageProps> = ({
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
    <div
      style={{
        alignItems: "center",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <h1
        style={{
          fontSize: "1.875rem",
          lineHeight: "2.25rem",
          marginBottom: "3.5rem",
        }}
      >
        How are you planning to use HASH?
      </h1>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: "3.5rem",
        }}
      >
        {USAGE_OPTIONS.map(({ title, description, icon, value }, index) => (
          <button
            key={value}
            style={{
              backgroundColor: "transparent",
              borderStyle: "none",
              cursor: "pointer",
              marginRight: index === 0 ? "2rem" : undefined,
              position: "relative",
              width: "13rem",
            }}
            onClick={() => setActiveOption(value)}
            type="button"
          >
            <div
              style={{
                alignItems: "center",
                backgroundColor: "#ffffff",
                borderColor: "#E5E7EB",
                borderRadius: "0.75rem",
                display: "flex",
                flex: "1 1 0%",
                flexDirection: "column",
                paddingBottom: "3.5rem",
                paddingLeft: "1.25rem",
                paddingRight: "1.25rem",
                paddingTop: "2rem",
                position: "relative",
                zIndex: "10",
              }}
            >
              {icon}
              <p
                style={{
                  fontSize: "1.125rem",
                  fontWeight: "700",
                  lineHeight: "1.75rem",
                  marginBottom: "1rem",
                }}
              >
                {title}
              </p>
              <p>{description}</p>
            </div>

            <div
              style={{
                position: "absolute",
                top: "-0.125rem",
                right: "-0.125rem",
                bottom: "-0.125rem",
                left: "-0.125rem",
                backgroundImage:
                  "background-image: linear-gradient(to bottom, var(--tw-gradient-stops))",
                backgroundColor: "#EC4899",
                transitionProperty: "opacity",
                opacity: "0",
                // removed tailwind classes: `transition-opacity opacity-0 ${
                //   activeOption === value
                //     ? "opacity-50"
                //     : "group-focus:opacity-20 group-hover:opacity-10"
                // } absolute -inset-0.5 bg-gradient-to-b from-blue-400 to-pink-500 filter blur`}
              }}
            />
          </button>
        ))}
      </div>
      {/* @todo use Button component */}
      <button
        type="submit"
        style={{
          alignItems: "center",
          backgroundColor: "#EC4899",
          backgroundImage:
            "background-image: linear-gradient(to right, var(--tw-gradient-stops))",
          borderRadius: "0.5rem",
          borderStyle: "none",
          color: "#ffffff",
          cursor: "pointer",
          display: "flex",
          fontSize: "0.875rem",
          fontWeight: "700",
          height: "2.75rem",
          justifyContent: "center",
          lineHeight: "1.25rem",
          transitionProperty: "all",
          width: "16rem",
        }}
        onClick={onSubmit}
        disabled={!activeOption || loading}
      >
        {loading ? (
          <SpinnerIcon
            style={{
              animation: "spin 1s linear infinite",
              color: "#ffffff",
              height: "1rem",
              width: "1rem",
            }}
          />
        ) : (
          <>
            <span>Continue</span>
            <span
              style={{
                marginLeft: "0.5rem",
                transitionProperty: "all",
                //
              }}
            >
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
