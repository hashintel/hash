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
      <p
        style={{
          color: "#3B82F6",
          fontSize: "1.5rem",
          fontWeight: "700",
          lineHeight: "2rem",
          marginBottom: "3rem",
        }}
      >
        {invitationInfo.inviterPreferredName
          ? `${invitationInfo.inviterPreferredName} has invited you to join 
          ${invitationInfo.orgName}`
          : ` You have been invited you to join ${invitationInfo.orgName}`}
      </p>
    );
  },
);
