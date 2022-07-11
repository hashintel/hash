import { GraphQLError } from "graphql";
import { ParsedUrlQueryInput } from "querystring";
import { OrgSize } from "../../graphql/apiTypes.gen";

export const SYNTHETIC_LOADING_TIME_MS = 700;

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
  query: ParsedUrlQueryInput,
): query is ParsedAuthQuery =>
  typeof query.verificationId === "string" &&
  typeof query.verificationCode === "string";

type ParsedInviteEmailQuery = {
  invitationEmailToken: string;
  orgEntityId: string;
  isExistingUser?: boolean;
  email: string;
} & ParsedUrlQueryInput;

type ParsedInviteLinkQuery = {
  invitationLinkToken: string;
  orgEntityId: string;
} & ParsedUrlQueryInput;

export const isParsedInvitationEmailQuery = (
  query: ParsedUrlQueryInput,
): query is ParsedInviteEmailQuery =>
  typeof query.orgEntityId === "string" &&
  typeof query.invitationEmailToken === "string" &&
  typeof query.email === "string" &&
  !!query.invitationEmailToken &&
  !!query.email;

export const isParsedInvitationLinkQuery = (
  query: ParsedUrlQueryInput,
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

// https://emailregex.com/
export const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;

export const parseGraphQLError = (
  errors: GraphQLError[],
  priorityErrorCode?: string,
): { errorCode: string; message: string } => {
  const priorityError = errors.find(
    ({ extensions }) => extensions?.code === priorityErrorCode,
  );

  if (priorityError) {
    return {
      errorCode: priorityError.extensions!.code,
      message: priorityError.message,
    };
  }

  return {
    errorCode: errors[0]!.extensions?.code,
    message: errors[0]!.message,
  };
};
