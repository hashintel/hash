import type { HashEntity } from "@local/hash-graph-sdk/entity";

import { systemEntityTypes } from "./ontology-type-ids.js";
import type {
  InvitationViaEmail,
  InvitationViaShortname,
} from "./system-types/shared.js";

const orgNameMaxLength = 256;

/**
 * Allows letters (any script), digits, spaces, and common punctuation.
 * Notably excludes < and > to prevent HTML injection.
 */
const validOrgNamePattern = /^[\p{L}\p{N}\s\-_.,:;'"&@#!?+=/\\()[\]{}]+$/u;

export const orgNameIsInvalid = (orgName: string): string | true => {
  if (orgName.length === 0) {
    return "Organization name is required";
  }
  if (orgName.length > orgNameMaxLength) {
    return `Organization name must be ${orgNameMaxLength} characters or fewer`;
  }
  if (orgName !== orgName.trim()) {
    return "Organization name must not have leading or trailing whitespace";
  }
  if (!validOrgNamePattern.test(orgName)) {
    return "Organization name contains invalid characters";
  }
  return true;
};

export const isInvitationByEmail = (
  invitation: HashEntity,
): invitation is HashEntity<InvitationViaEmail> =>
  invitation.metadata.entityTypeIds.includes(
    systemEntityTypes.invitationViaEmail.entityTypeId,
  );

export const isInvitationByShortname = (
  invitation: HashEntity,
): invitation is HashEntity<InvitationViaShortname> =>
  invitation.metadata.entityTypeIds.includes(
    systemEntityTypes.invitationViaShortname.entityTypeId,
  );
