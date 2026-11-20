import { Box, Typography } from "@mui/material";

import { extractBaseUrl } from "@blockprotocol/type-system";
import { Icon } from "@hashintel/ds-components";
import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { SelectDataTypeInput } from "../select-data-type-input";
import { getDataTypeIconName } from "../select-data-type-input/data-type-tree";
import { DataTypeCard, SectionCard } from "./data-type-card";

import type { ConstraintPrimitive } from "../constraint-util";
import type {
  AllowedTypeEntry,
  SelectDataTypeInputHandle,
} from "../select-data-type-input";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import type { ReactNode, RefObject } from "react";

/** A membership-only type's value definition, inherited through its groups */
export type DerivedValueRoot = {
  title: string;
  primitive: ConstraintPrimitive;
  viaTitle: string;
};

/**
 * The Extends card, in two sections over one entry list: what the type IS —
 * its concrete parent, list configuration or Group marker — and the groups
 * it belongs to, the abstract parents that bundle constraints without
 * defining the value. Children live in the members card.
 */
export const ExtendsCard = ({
  description,
  action,
  error,
  value,
  onChange,
  excludedBaseUrl,
  canEditDataType,
  readonly,
  handle,
  isMembershipParentRef,
  derivedValueRoot,
  offerGroup,
  childCompatibility,
  groupBaseRef,
  parentPickScope,
  pinnedGroupTitle,
  lockedDataTypeId,
}: {
  description: string;
  /** The header action — the "Extend a type" picker toggle, when offerable */
  action?: ReactNode;
  error?: string;
  value: AllowedTypeEntry[];
  onChange: (entries: AllowedTypeEntry[]) => void;
  excludedBaseUrl?: BaseUrl;
  canEditDataType: (dataTypeId: VersionedUrl) => boolean;
  readonly?: boolean;
  handle: RefObject<SelectDataTypeInputHandle | null>;
  /** Splits parent entries between the sections: true = a group membership */
  isMembershipParentRef: (dataTypeId: VersionedUrl) => boolean;
  derivedValueRoot: DerivedValueRoot | null;
  /**
   * An edited type offers Group only if it already was one, so removing the
   * entry isn't a dead end. A staged group's membership republishes ride the
   * parent drawer's save, like the group's own creation.
   */
  offerGroup: boolean;
  childCompatibility: { primitive: ConstraintPrimitive; title: string } | null;
  /** The base type every member shares, annotated on the Group row */
  groupBaseRef: VersionedUrl | null;
  parentPickScope?: ConstraintPrimitive;
  pinnedGroupTitle?: string;
  lockedDataTypeId?: VersionedUrl;
}) => {
  const hasVisibleValueContent = value.some((entry) =>
    entry.relation === "parent"
      ? extractBaseUrl(entry.dataTypeId) !==
          blockProtocolDataTypes.value.dataTypeBaseUrl &&
        !isMembershipParentRef(entry.dataTypeId)
      : entry.relation === "list" || entry.relation === "group",
  );
  const hasMembershipRows = value.some(
    (entry) =>
      entry.relation === "parent" && isMembershipParentRef(entry.dataTypeId),
  );

  const showExtendsSection =
    !readonly || hasVisibleValueContent || derivedValueRoot !== null;
  // Memberships are managed from the groups' own members cards — here they
  // only display (and detach), so the section exists only with rows to show
  const showMemberOfSection = hasMembershipRows || !!pinnedGroupTitle;

  if (!showExtendsSection && !showMemberOfSection) {
    return null;
  }

  const membershipInput = (
    <SelectDataTypeInput
      value={value}
      onChange={onChange}
      excludedBaseUrl={excludedBaseUrl}
      canEditDataType={canEditDataType}
      readonly={readonly}
      visibleRelations={["parent"]}
      entryFilter={isMembershipParentRef}
      addRelation="parent"
      pickGroups
      hideEmptyPicker
      pinnedGroupTitle={pinnedGroupTitle}
      lockedDataTypeId={lockedDataTypeId}
      expandableEntries={false}
    />
  );

  return (
    <SectionCard>
      <Box sx={{ padding: "16px 18px 18px" }}>
        {showMemberOfSection ? (
          <DataTypeCard label="Member of" contentGap={1}>
            {membershipInput}
          </DataTypeCard>
        ) : null}
        {showExtendsSection ? (
          <Box sx={{ marginTop: showMemberOfSection ? 3 : 0 }}>
            <DataTypeCard
              label="Extends"
              description={description}
              actions={action}
              errors={error ? [error] : undefined}
            >
              {derivedValueRoot ? (
                <Box
                  sx={{
                    border: ({ palette }) => `1px solid ${palette.gray[30]}`,
                    borderRadius: "10px",
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    padding: "6px 12px",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      color: ({ palette }) => palette.gray[50],
                      flexShrink: 0,
                    }}
                  >
                    <Icon
                      name={getDataTypeIconName({
                        title: derivedValueRoot.title,
                        format: undefined,
                        type: derivedValueRoot.primitive,
                        abstract: false,
                      })}
                      size="sm"
                    />
                  </Box>
                  <Typography
                    component="span"
                    sx={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: ({ palette }) => palette.gray[90],
                      flexShrink: 0,
                    }}
                  >
                    {derivedValueRoot.title}
                  </Typography>
                  <Typography
                    component="span"
                    sx={{
                      fontSize: 12,
                      color: ({ palette }) => palette.gray[50],
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Inherited through “{derivedValueRoot.viaTitle}”
                  </Typography>
                </Box>
              ) : (
                <SelectDataTypeInput
                  value={value}
                  onChange={onChange}
                  excludedBaseUrl={excludedBaseUrl}
                  canEditDataType={canEditDataType}
                  readonly={readonly}
                  handle={handle}
                  visibleRelations={["parent", "list", "group"]}
                  entryFilter={(dataTypeId) =>
                    !isMembershipParentRef(dataTypeId)
                  }
                  addRelation="parent"
                  offerGroup={offerGroup}
                  childCompatibility={childCompatibility}
                  groupBaseRef={groupBaseRef}
                  parentPickScope={parentPickScope}
                  lockedDataTypeId={lockedDataTypeId}
                  expandableEntries={false}
                />
              )}
            </DataTypeCard>
          </Box>
        ) : null}
      </Box>
    </SectionCard>
  );
};
