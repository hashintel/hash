import React, { useMemo, VFC } from "react";
import { Controller, useForm } from "react-hook-form";
import { tw } from "twind";

import { SelectInput } from "../../forms/SelectInput";
import { useShortnameInput } from "../../hooks/useShortnameInput";
import { InfoIcon, SpinnerIcon, LogoIcon } from "../../../shared/icons";
import { InvitationInfo, ORG_ROLES } from "../utils";

type AccountSetupProps = {
  onSubmit: (details: {
    shortname: string;
    preferredName: string;
    responsibility?: string;
  }) => void;
  loading: boolean;
  errorMessage?: string;
  email: string;
  invitationInfo: InvitationInfo | null;
};

type Inputs = {
  shortname: string;
  preferredName: string;
  responsibility?: string;
};

export const AccountSetup: VFC<AccountSetupProps> = ({
  onSubmit: setupAccount,
  loading,
  errorMessage,
  email,
  invitationInfo,
}) => {
  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors, isValid, touchedFields },
  } = useForm<Inputs>({
    mode: "all",
    defaultValues: {
      shortname: "",
      preferredName: "",
      responsibility: undefined,
    },
  });

  const shortnameWatcher = watch("shortname", "");
  const preferredNameWatcher = watch("preferredName", "");
  const responsibilityWatcher = watch("responsibility", "");

  const { validateShortname, parseShortnameInput, getShortnameError } =
    useShortnameInput();

  const onSubmit = handleSubmit(
    ({ shortname, preferredName, responsibility }) => {
      setupAccount({
        shortname,
        preferredName,
        ...(!!invitationInfo && { responsibility }),
      });
    },
  );

  const [title, subtitle] = useMemo(() => {
    if (invitationInfo) {
      return [
        "inviterPreferredName" in invitationInfo
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

  const shortnameError = getShortnameError(
    errors?.shortname?.message,
    Boolean(touchedFields.shortname),
  );

  return (
    <div className={tw`w-9/12 max-w-3xl`}>
      <LogoIcon className={tw`mb-16`} />
      <div className={tw`mb-9`}>
        <h1 className={tw`text-3xl font-bold mb-4`}>{title}</h1>
        <p className={tw`text-2xl mb-14 font-light`}>{subtitle}</p>
        <form onSubmit={onSubmit}>
          <div className={tw`mb-8`}>
            <label htmlFor="shortname" className={tw`block mb-5`}>
              <p className={tw`block font-bold uppercase mb-2`}>
                Personal Username
              </p>
              <p className={tw`text-sm text-black text-opacity-60 mb-5`}>
                Your own personal graph will exist under this username. e.g.
                https://hash.ai/
                <strong className={tw`text-black text-opacity-100`}>
                  @{shortnameWatcher || "example"}
                </strong>
              </p>
            </label>
            <div className={tw`flex items-center`}>
              <div className={tw`relative`}>
                <Controller
                  control={control}
                  name="shortname"
                  rules={{ validate: validateShortname }}
                  render={({ field }) => (
                    <input
                      id="shortname"
                      onChange={(evt) => {
                        const newEvt = { ...evt };
                        newEvt.target.value = parseShortnameInput(
                          newEvt.target.value,
                        );
                        field.onChange(newEvt);
                      }}
                      onBlur={field.onBlur}
                      autoFocus
                      className={tw`w-64 border-1 ${
                        shortnameError
                          ? "border-red-300 focus:border-red-500"
                          : "border-gray-300 focus:border-blue-500"
                      } focus:outline-none rounded-lg h-11 py-6 pl-9 pr-5 mr-7`}
                      placeholder="example"
                      autoComplete="off"
                    />
                  )}
                />

                <span
                  className={tw`absolute text-gray-400 left-5 top-1/2 -translate-y-1/2`}
                >
                  @
                </span>
              </div>
              <div
                style={{ minHeight: 50 }}
                className={tw`transition-opacity max-w-sm flex items-center border-1 ${
                  shortnameError ? "border-red-300" : "border-blue-300"
                } rounded-md px-3.5`}
              >
                <InfoIcon
                  className={tw`h-6 w-6 mr-3 ${
                    shortnameError ? "text-red-500" : "text-blue-500"
                  }`}
                />
                <span
                  className={tw`flex-1 ${
                    shortnameError
                      ? "text-red-500 text-sm"
                      : "text-black text-opacity-60 text-xs"
                  }`}
                >
                  {shortnameError || (
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
                {preferredNameWatcher || "Bobby"}
              </strong>
              ”
            </p>
            <input
              id="name"
              className={tw`w-64 border-1 border-gray-300 focus:outline-none focus:border-blue-500 rounded-lg h-11 py-6 px-5`}
              placeholder="Bobby"
              {...register("preferredName", { required: true })}
            />
          </div>

          {!!invitationInfo && (
            <div className={tw`mt-8`}>
              <Controller
                control={control}
                name="responsibility"
                rules={{ required: true }}
                render={({ field: { onChange, value } }) => (
                  <SelectInput
                    className="w-64"
                    label={`Your Role at ${invitationInfo.orgName}`}
                    labelClass="font-bold text-base mb-4"
                    id="responsibility"
                    options={ORG_ROLES}
                    onChange={onChange}
                    value={value}
                  />
                )}
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
              !isValid ||
              loading ||
              (!!invitationInfo && !responsibilityWatcher)
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
