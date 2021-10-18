import React, { VFC, useState, useMemo, useRef } from "react";
import { tw } from "twind";

import { unstable_batchedUpdates } from "react-dom";
import Logo from "../../../../assets/svg/logo.svg";
import IconInfo from "../../../Icons/IconInfo";
import { SpinnerIcon } from "../../../Icons/SpinnerIcon";
import { useShortnameInput } from "../../../hooks/useShortnameInput";
import { SelectInput } from "../../../forms/SelectInput";
import { ORG_ROLES } from "../utils";

type AccountSetupProps = {
  onSubmit: (details: {
    shortname: string;
    preferredName: string;
    responsibility?: string;
  }) => void;
  loading: boolean;
  errorMessage?: string;
  email: string;
  invitationInfo: {
    orgName: string;
    inviterPreferredName?: string;
    invitationEmailToken?: string;
    invitationLinkToken?: string;
  } | null;
};

export const AccountSetup: VFC<AccountSetupProps> = ({
  onSubmit,
  loading,
  errorMessage,
  email,
  invitationInfo,
}) => {
  const {
    shortname,
    setShortname,
    isShortnameValid,
    shortnameErrorMessage,
    isShortnameTooShort,
  } = useShortnameInput();
  const shortnameInputRef = useRef<HTMLInputElement>(null);
  const [shortnameIsFocused, setShortnameIsFocused] = useState(false);
  const [shortnameTouched, setShortnameTouched] = useState(false);

  const [preferredName, setPreferredName] = useState("");
  const [responsibility, setResponsibility] = useState<string | undefined>();

  const handleSubmit = (evt: React.FormEvent) => {
    evt.preventDefault();
    void onSubmit({
      shortname,
      preferredName,
      ...(!!invitationInfo && { responsibility }),
    });
  };

  const displayShortnameError =
    (shortnameTouched || !isShortnameTooShort) && !isShortnameValid;

  const [title, subtitle] = useMemo(() => {
    if (invitationInfo) {
      return [
        invitationInfo.inviterPreferredName
          ? `${invitationInfo.inviterPreferredName} has invited you to join ${invitationInfo.orgName} on HASH`
          : `You have been invited to join ${invitationInfo.orgName} on HASH`,
        `${email} has been confirmed. Now it's time to choose a username...`,
      ];
    }

    return [
      "Thanks for confirming your account",
      "Now it's time to choose a username...",
    ];
  }, [invitationInfo, email]);

  return (
    <div className={tw`w-9/12 max-w-3xl`}>
      <Logo className={tw`mb-16`} />
      <div className={tw`mb-9`}>
        <h1 className={tw`text-3xl font-bold mb-4`}>{title}</h1>
        <p className={tw`text-2xl mb-14 font-light`}>{subtitle}</p>
        <form onSubmit={handleSubmit}>
          <div className={tw`mb-8`}>
            <label
              htmlFor="shortname"
              className={tw`block font-bold uppercase mb-2`}
            >
              Personal Username
            </label>
            <p className={tw`text-sm text-black text-opacity-60 mb-5`}>
              Your own personal graph will exist under this username. e.g.
              https://hash.ai/
              <strong className={tw`text-black text-opacity-100`}>
                @{shortname || "example"}
              </strong>
            </p>
            <div className={tw`flex items-center`}>
              <div className={tw`relative`}>
                <input
                  id="shortname"
                  ref={shortnameInputRef}
                  autoFocus
                  className={tw`w-64 border-1 ${
                    displayShortnameError
                      ? "border-red-300 focus:border-red-500"
                      : "border-gray-300 focus:border-blue-500"
                  } focus:outline-none rounded-lg h-11 py-6 pl-9 pr-5 mr-7`}
                  placeholder="example"
                  required
                  value={shortname}
                  onChange={({ target }) => setShortname(target.value)}
                  onFocus={() => setShortnameIsFocused(true)}
                  onBlur={() =>
                    unstable_batchedUpdates(() => {
                      if (!shortnameTouched) setShortnameTouched(true);
                      setShortnameIsFocused(false);
                    })
                  }
                  autoComplete="off"
                />
                <span
                  className={tw`absolute text-gray-400 left-5 top-1/2 -translate-y-1/2`}
                >
                  @
                </span>
              </div>
              <div
                style={{ minHeight: 50 }}
                className={tw`transition-opacity ${
                  shortnameIsFocused || displayShortnameError
                    ? "opacity-100"
                    : "opacity-0"
                } max-w-sm flex items-center border-1 ${
                  displayShortnameError ? "border-red-300" : "border-blue-300"
                } rounded-md px-3.5`}
              >
                <IconInfo
                  className={tw`h-6 w-6 mr-3 ${
                    displayShortnameError ? "text-red-500" : "text-blue-500"
                  }`}
                />
                <span
                  className={tw`flex-1 ${
                    displayShortnameError
                      ? "text-red-500 text-sm"
                      : "text-black text-opacity-60 text-xs"
                  }`}
                >
                  {displayShortnameError ? (
                    shortnameErrorMessage
                  ) : (
                    <>
                      If you’re using HASH for work or a team, you’ll be able to
                      choose a separate org username later.
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>
          <div className={tw``}>
            <label
              htmlFor="name"
              className={tw`block font-bold uppercase mb-2`}
            >
              Preferred name{" "}
              <span className={tw`font-normal`}>or first name</span>
            </label>
            <p className={tw`text-sm text-black text-opacity-60 mb-5`}>
              What shall we call you when referring to you? e.g. “Hi,{" "}
              <strong className={tw`text-black text-opacity-100 capitalize`}>
                {preferredName || "Bobby"}
              </strong>
              ”
            </p>
            <input
              id="name"
              className={tw`w-64 border-1 border-gray-300 focus:outline-none focus:border-blue-500 rounded-lg h-11 py-6 px-5`}
              placeholder="Bobby"
              required
              value={preferredName}
              onChange={(evt) => setPreferredName(evt.target.value)}
            />
          </div>

          {!!invitationInfo && (
            <div className={tw`mt-8`}>
              <SelectInput
                label={`Your Role at ${invitationInfo.orgName}`}
                labelClass="font-bold text-base mb-4"
                id="responsibility"
                options={ORG_ROLES}
                onChangeValue={setResponsibility}
                value={responsibility}
                required
              />
              {errorMessage ? (
                <p className={tw`text-red-500 text-sm mt-5 `}>{errorMessage}</p>
              ) : null}
            </div>
          )}

          <button
            type="submit"
            className={tw`group w-64 bg-gradient-to-r from-blue-400 via-blue-500 to-pink-500 rounded-lg h-11 transition-all disabled:opacity-50 flex items-center justify-center text-white text-sm font-bold mt-14`}
            disabled={
              !preferredName ||
              !isShortnameValid ||
              loading ||
              (!!invitationInfo && !responsibility)
            }
          >
            {loading ? (
              <SpinnerIcon className={tw`h-4 w-4 text-white animate-spin`} />
            ) : (
              <>
                <span>Continue</span>
                <span
                  className={tw`ml-2 transition-all group-hover:translate-x-1`}
                >
                  &rarr;
                </span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
