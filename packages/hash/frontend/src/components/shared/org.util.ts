import { User } from "./user.util";

export type Org = {
  entityId: string;
  shortname: string;
  name: string;
  numberOfMembers: number;
};

export type OrgWithMembers = Org & { members: User };

export type OrgWithResponsibility = Org & { responsibility: string };
