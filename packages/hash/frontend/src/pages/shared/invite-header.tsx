import { FunctionComponent, memo } from "react";

type InviteHeaderProps = {
  invitationInfo: {
    orgName: string;
    orgEntityId: string;
    inviterPreferredName?: string;
  };
};

export const InviteHeader: FunctionComponent<InviteHeaderProps> = memo(
  ({ invitationInfo }) => {
    return (
      <p style={tw`font-bold text-2xl text-blue-500 mb-12`}>
        {invitationInfo.inviterPreferredName
          ? `${invitationInfo.inviterPreferredName} has invited you to join 
          ${invitationInfo.orgName}`
          : ` You have been invited you to join ${invitationInfo?.orgName}`}
      </p>
    );
  },
);
