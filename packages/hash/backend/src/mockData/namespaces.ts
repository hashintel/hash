import { DbOrg, DbUser } from "src/types/dbTypes";

export const namespaces: (DbUser | DbOrg)[] = [
  {
    email: "aj@hash.ai",
    shortname: "akash",
    id: "1",
    type: "User",
  },
  {
    email: "c@hash.ai",
    shortname: "ciaran",
    id: "2",
    type: "User",
  },
  {
    email: "d@hash.ai",
    shortname: "d",
    id: "3",
    type: "User",
  },
  {
    email: "ef@hash.ai",
    shortname: "eadan",
    id: "4",
    type: "User",
  },
  {
    email: "nh@hash.ai",
    shortname: "nate",
    id: "5",
    type: "User",
  },
  {
    shortname: "hash",
    id: "6",
    type: "Org",
  },
];
