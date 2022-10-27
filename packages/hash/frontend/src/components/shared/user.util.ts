import { OrgWithResponsibility } from "./org.util";

export type User = {
  entityId: string;
  accountSignupComplete: boolean;
  shortname?: string;
  preferredName?: string;
  emails: { address: string; primary: boolean; verified: boolean }[];
};

export type UserWithOrgMemberships = User & {
  memberOf: OrgWithResponsibility[];
};
