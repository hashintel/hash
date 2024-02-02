import { PropertyType, VersionedUrl } from "@blockprotocol/type-system/slim";
import { Collapse, Table, TableBody, TableCell, TableRow } from "@mui/material";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { usePropertyTypesOptions } from "../../shared/property-types-options-context";
import { useIsReadonly } from "../../shared/read-only-context";
import { REQUIRED_CELL_WIDTH } from "../property-list-card";
import { CollapsibleRowLine } from "../shared/collapsible-row-line";
import { EntityTypeTableRow } from "../shared/entity-type-table";
import { generateReadonlyMessage } from "../shared/generate-readonly-message";
import { MULTIPLE_VALUES_CELL_WIDTH } from "../shared/multiple-values-cell";
import { TypeMenuCell } from "../shared/type-menu-cell";
import { InheritanceData } from "../shared/use-inherited-values";
import { useTypeVersions } from "../shared/use-type-versions";
import { DisabledCheckboxCell } from "./disabled-checkbox-cell";
import { PropertyExpectedValues } from "./property-expected-values";
import { PropertyTitleCell } from "./property-title-cell";

const CollapsibleTableRow = ({
  expanded,
  depth,
  lineHeight,
  children,
}: {
  expanded: boolean;
  depth: number;
  lineHeight: number;
  children: ReactNode;
}) => {
  return (
    <TableRow>
      <TableCell colSpan={12} sx={{ p: "0 !important", position: "relative" }}>
        <Collapse
          in={expanded}
          sx={{
            position: "relative",
            top: `-${lineHeight}px`,
            mb: `-${lineHeight}px`,
            pointerEvents: "none",
          }}
          appear
        >
          <CollapsibleRowLine height={`${lineHeight}px`} depth={depth} />

          <Table sx={{ mt: `${lineHeight}px`, pointerEvents: "all" }}>
            <TableBody
              sx={{
                "::before": {
                  height: 0,
                },
              }}
            >
              {children}
            </TableBody>
          </Table>
        </Collapse>
      </TableCell>
    </TableRow>
  );
};

export const PropertyRow = ({
  property,
  isArray,
  isRequired,
  depth = 0,
  lines = [],
  parentPropertyName,
  allowArraysTableCell,
  requiredTableCell,
  menuTableCell,
  onUpdateVersion,
  flash = false,
  inheritanceChain,
}: {
  property: PropertyType;
  isArray: boolean;
  isRequired: boolean;
  depth?: number;
  lines?: boolean[];
  parentPropertyName?: string;
  allowArraysTableCell?: ReactNode;
  requiredTableCell?: ReactNode;
  menuTableCell?: ReactNode;
  onUpdateVersion?: (nextId: VersionedUrl) => void;
  flash?: boolean;
} & Partial<InheritanceData>) => {
  const propertyTypesOptions = usePropertyTypesOptions();

  const isReadonly = useIsReadonly();

  const [currentVersion, latestVersion, baseUrl] = useTypeVersions(
    property.$id,
    propertyTypesOptions,
  );

  const [expanded, setExpanded] = useState(true);

  const mainRef = useRef<HTMLTableRowElement | null>(null);
  const [lineHeight, setLineHeight] = useState(0);

  const [animatingOutExpectedValue, setAnimatingOutExpectedValue] =
    useState(false);
  const [selectedExpectedValueIndex, setSelectedExpectedValueIndex] =
    useState(-1);

  const children = useMemo(() => {
    const selectedProperty = property.oneOf[selectedExpectedValueIndex]
      ? property.oneOf[selectedExpectedValueIndex]
      : null;

    const selectedObjectProperties =
      selectedProperty && "properties" in selectedProperty
        ? selectedProperty.properties
        : undefined;

    return selectedObjectProperties
      ? Object.entries(selectedObjectProperties).reduce(
          (
            childrenArray: ({
              array: boolean;
              required: boolean;
            } & PropertyType)[],
            [propertyId, ref],
          ) => {
            const $ref = "items" in ref ? ref.items.$ref : ref.$ref;
            const propertyType = propertyTypesOptions[$ref];

            if (propertyType) {
              const array = "type" in ref;
              const required = Boolean(
                selectedProperty &&
                  "required" in selectedProperty &&
                  selectedProperty.required?.includes(propertyId),
              );
              return [
                ...childrenArray,
                { ...propertyType.schema, array, required },
              ];
            }

            return childrenArray;
          },
          [],
        )
      : [];
  }, [selectedExpectedValueIndex, property.oneOf, propertyTypesOptions]);

  const handleResize = () => {
    if (mainRef.current) {
      setLineHeight(mainRef.current.offsetHeight * 0.5 - 8);
    }
  };

  useEffect(() => {
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const readonlyMessage = generateReadonlyMessage(
    inheritanceChain
      ? { inheritanceChain }
      : { parentPropertyName: parentPropertyName ?? "parent" },
  );

  return (
    <>
      <EntityTypeTableRow
        inherited={!!inheritanceChain}
        ref={(row: HTMLTableRowElement | null) => {
          if (row) {
            mainRef.current = row;
            handleResize();
          }
        }}
        flash={flash}
      >
        <PropertyTitleCell
          property={property}
          array={isArray}
          depth={depth}
          inherited={!!inheritanceChain}
          lines={lines}
          expanded={children.length ? expanded : undefined}
          setExpanded={setExpanded}
          currentVersion={currentVersion}
          latestVersion={latestVersion}
          onUpdateVersion={() => {
            if (latestVersion) {
              onUpdateVersion?.(`${baseUrl}v/${latestVersion}`);
            }
          }}
        />

        <TableCell>
          <PropertyExpectedValues
            property={property}
            selectedExpectedValueIndex={selectedExpectedValueIndex}
            setSelectedExpectedValueIndex={(value) => {
              setSelectedExpectedValueIndex(value);
              setExpanded(true);
            }}
            setAnimatingOutExpectedValue={setAnimatingOutExpectedValue}
          />
        </TableCell>

        {allowArraysTableCell && !isReadonly && !parentPropertyName ? (
          allowArraysTableCell
        ) : (
          <DisabledCheckboxCell
            title={isReadonly ? undefined : readonlyMessage}
            checked={isArray}
            width={MULTIPLE_VALUES_CELL_WIDTH}
            sx={{ pr: 1 }}
          />
        )}

        {requiredTableCell && !isReadonly && !parentPropertyName ? (
          requiredTableCell
        ) : (
          <DisabledCheckboxCell
            title={isReadonly ? undefined : readonlyMessage}
            checked={isRequired}
            width={REQUIRED_CELL_WIDTH}
          />
        )}

        {menuTableCell ?? (
          <TypeMenuCell
            typeId={property.$id}
            variant="property"
            editable={false}
          />
        )}
      </EntityTypeTableRow>

      {children.length ? (
        <CollapsibleTableRow
          expanded={expanded && !animatingOutExpectedValue}
          depth={depth}
          lineHeight={lineHeight}
        >
          {children.map((prop, pos) => (
            <PropertyRow
              key={prop.$id}
              property={prop}
              depth={depth + 1}
              lines={[...lines, pos !== children.length - 1]}
              isArray={prop.array}
              isRequired={prop.required}
              parentPropertyName={property.title}
            />
          ))}
        </CollapsibleTableRow>
      ) : null}
    </>
  );
};
