import type { FunctionComponent } from "react";
import { memo } from "react";

type InviteHeaderProps = {
  invitationInfo: {
    orgName: string;
    orgEntityId: string;
    inviterDisplayName?: string;
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
        {invitationInfo.inviterDisplayName
          ? `${invitationInfo.inviterDisplayName} has invited you to join 
          ${invitationInfo.orgName}`
          : ` You have been invited you to join ${invitationInfo.orgName}`}
      </p>
    );
  },
);
