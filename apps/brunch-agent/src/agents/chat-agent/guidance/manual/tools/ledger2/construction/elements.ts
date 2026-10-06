import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";

import { netElementKinds } from "@hashintel/brunch-agent-plugin-sdcpn";

import { vClaimId } from "../elicitation/claims.ts";
import { vEntityId } from "../elicitation/entities.ts";
import { vStatus } from "../shared/epistemics.ts";

export const vNetElementAddress = v.pipe(
  v.strictObject({
    kind: v.pipe(
      v.picklist(netElementKinds),
      v.description("The kind of the inspected net element."),
    ),
    id: v.pipe(
      v.string(),
      v.minLength(1),
      v.description(
        "The net element's ID from an inspection or accepted mutation, not a display name or Ledger entity ID.",
      ),
    ),
  }),
  v.description("An address of an observed net element by kind and ID."),
);

export const vElement = v.pipe(
  v.strictObject({
    address: vNetElementAddress,
    text: v.pipe(
      v.string(),
      v.minLength(1),
      v.description("What this net element represents in the USER's account."),
    ),
    status: vStatus,
    entities: v.pipe(
      v.array(vEntityId),
      v.description("IDs of the Ledger entities this net element represents."),
    ),
    claims: v.pipe(
      v.array(vClaimId),
      v.description("IDs of the claims this interpretation rests on."),
    ),
  }),
  v.description(
    "An interpretation of what an inspected net element represents. Its status concerns the USER's agreement to that interpretation, independently of the source claims or tool acceptance.",
  ),
);

export type NetElementAddress = v.InferOutput<typeof vNetElementAddress>;
export type Element = v.InferOutput<typeof vElement>;

export const NetElementAddressSchema = toJsonSchema(vNetElementAddress);
export const ElementSchema = toJsonSchema(vElement);
