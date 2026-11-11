/**
 * A property of an entity, as Read entity's Property row shows it (decided 11 Nov ~16:30): `Supplier › Name`, the
 * entity type's name, then the property's type icon and its name. The same in the editor field and the run view.
 */
import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { kindIcon } from "./kind-icon";
import { type MockPropertyType, mockEntityTypes } from "./mock-graph";

const pathStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  minWidth: "[0]",
  whiteSpace: "nowrap",
});

const chevronStyle = css({ color: "neutral.fg.subtle" });

const iconStyle = css({
  display: "inline-flex",
  color: "neutral.fg.muted",
});

const nameStyle = css({ overflow: "hidden", textOverflow: "ellipsis" });

/** The property's name with its type icon before it: a menu row, and the end of the path. */
export const PropertyName = ({
  property,
}: {
  property: Pick<MockPropertyType, "title" | "payloadKind">;
}) => (
  <span className={pathStyle}>
    <span className={iconStyle}>
      <Icon name={kindIcon(property.payloadKind)} size="sm" />
    </span>
    <span className={nameStyle}>{property.title}</span>
  </span>
);

export const PropertyPath = ({
  typeTitle,
  property,
}: {
  typeTitle: string;
  property: Pick<MockPropertyType, "title" | "payloadKind">;
}) => (
  <span className={pathStyle}>
    <span>{typeTitle}</span>
    <span className={chevronStyle}>›</span>
    <PropertyName property={property} />
  </span>
);

/** A property of the catalogue's entity type by their titles, e.g. ("Supplier", "Name"), for the mocked run views. */
export const propertyPathOf = (typeTitle: string, propertyTitle: string) => {
  const property = mockEntityTypes
    .find((type) => type.title === typeTitle)
    ?.properties.find((candidate) => candidate.title === propertyTitle);
  return property ? (
    <PropertyPath typeTitle={typeTitle} property={property} />
  ) : (
    `${typeTitle} › ${propertyTitle}`
  );
};
