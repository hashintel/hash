import React from "react";
import { tw } from "twind";

type InviteHeaderProps = {
  invitationInfo: {
    orgName: string;
    orgEntityId: string;
    inviterPreferredName?: string;
  };
};

export const InviteHeader: React.VFC<InviteHeaderProps> = React.memo(
  ({ invitationInfo }) => {
    return (
      <p className={tw`font-bold text-2xl text-blue-500 mb-12`}>
        {invitationInfo.inviterPreferredName
          ? `${invitationInfo.inviterPreferredName} has invited you to join 
          ${invitationInfo.orgName}`
          : ` You have been invited you to join ${invitationInfo?.orgName}`}
      </p>
    );
  },
);
