import { ParsedUrlQueryInput } from "querystring";
import { OrgSize } from "../../../graphql/apiTypes.gen";

export const SYNTHETIC_LOADING_TIME_MS = 700;

export const AUTH_ERROR_CODES = {
  ALREADY_EXISTS: "A user with this email already exists",
  EXPIRED: "This verification code has expired, please try again.",
  INCORRECT: "Incorrect, please try again.",
  LOGIN_CODE_NOT_FOUND: "An unexpected error occurred, please try again.",
  MAX_ATTEMPTS:
    "You have exceeded the maximum number of attempts for this login code, please try again.",
  NOT_FOUND: "An unexpected error occurred, please try again.",
  SHORTNAME_TAKEN: "The shortname is already taken",
  ALREADY_USED: "This verification code has already been used.",
} as const;

// @todo add appropriate error messages
export const INVITE_ERROR_CODES = {
  ALREADY_USED: "",
  NOT_FOUND: "",
  ORG_NOT_FOUND: "",
  REVOKED: "",
} as const;

export type Action<S, T = undefined> = T extends undefined
  ? { type: S }
  : {
      type: S;
      payload: T;
    };

type ParsedAuthQuery = {
  verificationId: string;
  verificationCode: string;
};

export const isParsedAuthQuery = (
  query: ParsedUrlQueryInput
): query is ParsedAuthQuery =>
  typeof query.verificationId === "string" &&
  typeof query.verificationCode === "string";

type ParsedInviteEmailQuery = {
  invitationEmailToken: string;
  orgEntityId: string;
  isExistingUser?: boolean;
} & ParsedUrlQueryInput;

type ParsedInviteLinkQuery = {
  invitationLinkToken: string;
  orgEntityId: string;
} & ParsedUrlQueryInput;

export const isParsedInvitationEmailQuery = (
  query: ParsedUrlQueryInput
): query is ParsedInviteEmailQuery =>
  typeof query.orgEntityId === "string" &&
  typeof query.invitationEmailToken === "string" &&
  !!query.invitationEmailToken;

export const isParsedInvitationLinkQuery = (
  query: ParsedUrlQueryInput
): query is ParsedInviteLinkQuery =>
  typeof query.orgEntityId === "string" &&
  typeof query.invitationLinkToken === "string" &&
  !!query.invitationLinkToken;

type InvitationEmailInfo = {
  orgName: string;
  orgEntityId: string;
  inviterPreferredName: string;
  invitationEmailToken: string;
};

type InvitationLinkInfo = {
  orgName: string;
  orgEntityId: string;
  invitationLinkToken: string;
};

export type InvitationInfo = InvitationEmailInfo | InvitationLinkInfo;

export const ORG_ROLES = [
  { label: "Marketing", value: "Marketing" },
  { label: "Sales", value: "Sales" },
  { label: "Operations", value: "Operations" },
  { label: "Customer Success", value: "Customer Success" },
  { label: "Design", value: "Design" },
  { label: "Engineering", value: "Engineering" },
  { label: "Product", value: "Product" },
  { label: "IT", value: "IT" },
  { label: "HR", value: "HR" },
  { label: "Cross-Functional", value: "Cross-Functional" },
  { label: "Other", value: "Other" },
];

export const ORG_SIZES = [
  { label: "1-10 people", value: OrgSize.OneToTen },
  { label: "11-50 people", value: OrgSize.ElevenToFifty },
  { label: "51-250 people", value: OrgSize.FiftyOneToTwoHundredAndFifty },
  { label: "250+ people", value: OrgSize.TwoHundredAndFiftyPlus },
];
