import { useMutation } from "@apollo/client";
import React, { VFC, useState, useMemo } from "react";
import { tw } from "twind";
import {
  CreateOrgEmailInvitationMutation,
  CreateOrgEmailInvitationMutationVariables,
} from "../../../graphql/apiTypes.gen";
import { createOrgEmailInvitation as createOrgEmailInvitationMutation } from "../../../graphql/queries/org.queries";
import { TagsInput } from "../../forms/TagsInput";
import { SpinnerIcon } from "../../../shared/icons";
import { EMAIL_REGEX } from "../utils";

type OrgInviteProps = {
  navigateToHome: () => void;
  createOrgInfo: {
    invitationLinkToken: string;
    orgEntityId: string;
  };
};

const isValidEmail = (email: string) => {
  return EMAIL_REGEX.test(email);
};

export const OrgInvite: VFC<OrgInviteProps> = ({
  navigateToHome,
  createOrgInfo,
}) => {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [sendingInvitations, setSendingInvitations] = useState(false);

  const [sendEmailInvitation] = useMutation<
    CreateOrgEmailInvitationMutation,
    CreateOrgEmailInvitationMutationVariables
  >(createOrgEmailInvitationMutation, {
    onCompleted: (_) => {},
    onError: ({ graphQLErrors }) => {
      const errorMsg = graphQLErrors[0]!.message;
      setError(errorMsg);
    },
  });

  const onSubmit = async () => {
    setSendingInvitations(true);
    await Promise.all(
      emails.map((email) =>
        sendEmailInvitation({
          variables: {
            orgEntityId: createOrgInfo.orgEntityId,
            inviteeEmailAddress: email,
          },
        }),
      ),
    );
    setSendingInvitations(false);
    navigateToHome();
  };

  const invitationLink = useMemo(() => {
    if (!createOrgInfo) return "-";

    const inviteQueryParams = new URLSearchParams({
      orgEntityId: createOrgInfo.orgEntityId,
      invitationLinkToken: createOrgInfo.invitationLinkToken,
    });

    return `${window.location.origin}/invite?${inviteQueryParams}`;
  }, [createOrgInfo]);

  const handleCopyBtnClick = async () => {
    if (!invitationLink) return;

    setCopied(true);
    await navigator.clipboard.writeText(invitationLink);
    setTimeout(() => {
      setCopied(false);
    }, 4000);
  };

  return (
    <div className={tw`w-full flex flex-col items-center`}>
      <h1 className={tw`text-3xl font-bold mb-12`}>Invite your teammates</h1>
      <div className={tw`w-4/12`}>
        <div className={tw`mb-7`}>
          <p className={tw`mb-2 uppercase text-sm font-semibold`}>
            Share an invite link
          </p>
          <div
            className={tw`flex items-center bg-white border(1 gray-300) rounded-lg h-11 pl-5 pr-24 mb-2 w-full relative`}
          >
            <span
              className={tw`whitespace-nowrap overflow-ellipsis overflow-hidden`}
            >
              {invitationLink}
            </span>
            <button
              type="button"
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
          <p className={tw`mb-2 uppercase text-sm font-semibold`}>
            Invite via email
          </p>
          <TagsInput
            minHeight={96}
            tags={emails}
            setTags={setEmails}
            placeholder="Enter Email"
            isValid={isValidEmail}
            delimiters={[","]}
          />
          {error && <p className={tw`text-red-500 text-sm mt-5 `}>{error}</p>}
        </div>

        {/* Commenting this out till this scenario is handled */}
        {/* <div className={tw`mb-12 `}>
          <label className={tw`flex items-center`}>
            <input type="checkbox" className={tw`w-4 h-4`} />
            <span className={tw`ml-2 text-sm`}>
              Allow anyone with a <strong>@example.com</strong> email to join this
              workspace
            </span>
          </label>
        </div> */}

        <div className={tw`flex flex-col`}>
          <button
            type="submit"
            className={tw`group w-64 bg-gradient-to-r from-blue-400 via-blue-500 to-pink-500 rounded-lg h-11 transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center text-white text-sm font-bold mx-auto mb-4`}
            disabled={sendingInvitations}
            onClick={onSubmit}
          >
            {sendingInvitations ? (
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
        </div>
      </div>
    </div>
  );
};
