import type { EntityTypeWithMetadata, WebId } from "@blockprotocol/type-system";
import type { Subtype } from "@local/advanced-types/subtype";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  FormattedText,
  GoogleSheet,
  PayloadKind,
} from "@local/hash-isomorphic-utils/flows/types";
import type { ActorTypeDataType } from "@local/hash-isomorphic-utils/system-types/google/googlesheetsfile";

const unsupportedPayloadKinds = [
  /** @todo support ActorType to vary Sheet output formatting */
  "ActorType",
  /** @todo support EntityId – requires updating the EntitySelector */
  "EntityId",
  "PersistedEntities",
  "PersistedEntity",
  "ProposedEntity",
  "ProposedEntityWithResolvedLinks",
  "FormattedText",
  "WebPage",
  "WebSearchResult",
] as const satisfies ReadonlyArray<PayloadKind>;

type UnsupportedPayloadKind = (typeof unsupportedPayloadKinds)[number];

export type LocalPayloadKind = Exclude<PayloadKind, UnsupportedPayloadKind>;

export const isSupportedPayloadKind = (
  kind: PayloadKind,
): kind is LocalPayloadKind =>
  !unsupportedPayloadKinds.includes(kind as UnsupportedPayloadKind);

export type LocalInputValue =
  | HashEntity
  | EntityTypeWithMetadata
  | FormattedText
  | GoogleSheet
  | WebId
  | string
  | number
  | boolean;

export type LocalInputValues = Subtype<
  Record<LocalPayloadKind, LocalInputValue>,
  {
    ActorType: ActorTypeDataType;
    Date: string;
    Entity: HashEntity;
    FormattedText: FormattedText;
    GoogleAccountId: string;
    GoogleSheet: GoogleSheet;
    Text: string;
    Number: number;
    Boolean: boolean;
    VersionedUrl: EntityTypeWithMetadata;
  }
>;

export type LocalPayload = {
  [K in LocalPayloadKind]: {
    kind: K;
    value?: LocalInputValues[K] | LocalInputValues[K][];
  };
}[LocalPayloadKind];

export type FormState = {
  [outputName: string]: {
    outputName: string;
    payload: LocalPayload;
  };
};
