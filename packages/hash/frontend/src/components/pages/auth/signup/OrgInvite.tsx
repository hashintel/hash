import React, { VFC, useState } from "react";
import { useForm } from "react-hook-form";
import { tw } from "twind";
import { IconSpinner } from "../../../Icons/IconSpinner";

type OrgInviteProps = {
  invitationLink?: string;
  loading: boolean;
  sendEmailInvite: (email: string) => void;
  navigateToHome: () => void;
};

export const OrgInvite: VFC<OrgInviteProps> = ({
  invitationLink,
  loading,
  sendEmailInvite,
  navigateToHome,
}) => {
  const [copied, setCopied] = useState(false);
  const [showSuccessMsg, setShowSuccessMsg] = useState(false);
  const { register, handleSubmit, formState } = useForm<{
    inviteeEmail: string;
  }>({
    mode: "onChange",
  });

  const onSubmit = handleSubmit(async ({ inviteeEmail }) => {
    await sendEmailInvite(inviteeEmail);
    setShowSuccessMsg(true);
    setTimeout(navigateToHome, 3000);
  });

  console.log(formState.errors);

  const handleCopyBtnClick = async () => {
    setCopied(true);

    if (invitationLink) {
      navigator.clipboard.writeText(invitationLink);
    }

    setTimeout(() => {
      setCopied(false);
    }, 4000);
  };

  return (
    <div className={tw`w-full flex flex-col items-center`}>
      <h1 className={tw`text-3xl font-bold mb-12`}>Invite your teammates</h1>
      <div className={tw`w-4/12`}>
        <div className={tw`mb-7`}>
          <label className={tw`mb-2 uppercase text-sm font-semibold`}>
            Share an invite link
          </label>
          <div
            className={tw`flex items-center border(1 gray-300) rounded-lg h-11 pl-5 pr-24 mb-2 w-full relative`}
          >
            <span
              className={tw`whitespace-nowrap overflow-ellipsis overflow-hidden`}
            >
              {invitationLink}
            </span>
            <button
              className={tw`absolute right-0 top-0 bottom-0 w-24 flex justify-center items-center text-white rounded-r-lg  ${
                copied ? "bg(green-500)" : "bg(blue-500 hover:blue-700)"
              } `}
              disabled={copied}
              onClick={handleCopyBtnClick}
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
        </div>

        <div className={tw`mb-12`}>
          <label className={tw`mb-2 uppercase text-sm font-semibold`}>
            Invite via email
          </label>
          <textarea
            className={tw`block w-full border(1 gray-300 hover:gray-400 focus:gray-500) focus:outline-none rounded-lg py-4 px-5 resize-none mb-1`}
            // Commenting this out till the api can handle sending invites to multiple emails
            // placeholder="Type or paste one or more emails here, seperated by commas"
            placeholder="Type or paste the invitee's email"
            rows={2}
            {...register("inviteeEmail", {
              required: true,
            })}
          ></textarea>
          {showSuccessMsg && (
            <p className={tw`text-sm text-green-500`}>Email invite sent!</p>
          )}
        </div>

        {/* Commenting this out till this scenario is handled */}
        {/* <div className={tw`mb-12 `}>
          <label className={tw`flex items-center`}>
            <input type="checkbox" className={tw`w-4 h-4`} />
            <span className={tw`ml-2 text-sm`}>
              Allow anyone with a <strong>@acme.com</strong> email to join this
              workspace
            </span>
          </label>
        </div> */}

        <div className={tw`flex flex-col`}>
          <button
            className={tw`group w-64 bg-gradient-to-r from-blue-400 via-blue-500 to-pink-500 rounded-lg h-11 transition-all disabled:opacity-50 flex items-center justify-center text-white text-sm font-bold mx-auto mb-4`}
            disabled={loading || !formState.isValid}
            onClick={onSubmit}
          >
            {loading ? (
              <IconSpinner className={tw`h-4 w-4 text-white animate-spin`} />
            ) : (
              <>
                <span>Send Invite</span>
                <span
                  className={tw`ml-2 transition-all group-hover:translate-x-1`}
                >
                  &rarr;
                </span>
              </>
            )}
          </button>

          <button
            onClick={navigateToHome}
            className={tw`mx-auto text-blue-500 underline`}
          >
            Do this later
          </button>
        </div>
      </div>
    </div>
  );
};
