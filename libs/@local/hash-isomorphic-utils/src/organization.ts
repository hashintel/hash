import type { HashEntity } from "@local/hash-graph-sdk/entity";

import { systemEntityTypes } from "./ontology-type-ids.js";
import type {
  InvitationViaEmail,
  InvitationViaShortname,
} from "./system-types/shared.js";

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
