import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useRef, useState } from "react";

import {
  extractBaseUrl,
  extractVersion,
  versionedUrlFromComponents,
} from "@blockprotocol/type-system";
import {
  ArrowUpRightFromSquareRegularIcon,
  ArrowUpRightIcon,
  PenRegularIcon,
} from "@hashintel/design-system";

import { generateLinkParameters } from "../../../shared/generate-link-parameters";
import { Button, Link } from "../../../shared/ui";
import { CopyableOntologyChip } from "../copyable-ontology-chip";
import { DataTypeEditorDrawer } from "../data-type-editor-drawer";
import { useSlideStack } from "../slide-stack";
import { useTextSize } from "../use-text-size";
import { DataTypeDescription } from "./data-type-header/data-type-description";

import type { DataType, OntologyTypeVersion } from "@blockprotocol/type-system";

interface DataTypeHeaderProps {
  currentVersion: OntologyTypeVersion;
  dataTypeSchema: DataType;
  isInSlide?: boolean;
  isReadOnly: boolean;
  latestVersion?: OntologyTypeVersion | null;
  onEdit?: () => void;
}

export const DataTypeHeader = ({
  currentVersion,
  dataTypeSchema,
  isInSlide,
  isReadOnly,
  latestVersion,
  onEdit,
}: DataTypeHeaderProps) => {
  const router = useRouter();

  const [showExtendTypeDrawer, setShowExtendTypeDrawer] = useState(false);

  const isLatest =
    !latestVersion || extractVersion(dataTypeSchema.$id) === latestVersion;

  const latestVersionUrl = versionedUrlFromComponents(
    extractBaseUrl(dataTypeSchema.$id),
    latestVersion ?? currentVersion,
  );

  const { slideContainerRef, pushToSlideStack, closeSlideStack } =
    useSlideStack();

  const dataTypeTitleTextRef = useRef<HTMLHeadingElement | null>(null);

  const dataTypeTitleSize = useTextSize(dataTypeTitleTextRef);

  return (
    <>
      <Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          {!isLatest && (
            <Link
              href={latestVersionUrl}
              onClick={(event) => {
                if (isInSlide) {
                  event.preventDefault();
                  pushToSlideStack({
                    kind: "dataType",
                    itemId: latestVersionUrl,
                  });
                }
              }}
              sx={{
                textDecoration: "none",
              }}
            >
              <Typography
                color="inherit"
                sx={{ fontSize: 11, fontWeight: 600 }}
              >
                {`v${currentVersion.toString()}–> v${latestVersion.toString()} available`}
              </Typography>
            </Link>
          )}
        </Stack>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
        >
          <Stack direction="row" alignItems="center" gap={5}>
            <Stack direction="row" mt={1} mb={3}>
              <Box position="relative">
                <Tooltip
                  placement="top"
                  componentsProps={{
                    popper: {
                      container: slideContainerRef?.current,
                    },
                    tooltip: {
                      sx: {
                        background: "transparent",
                        marginBottom: "5px !important",
                        maxWidth: "unset",
                        p: 0,
                      },
                    },
                  }}
                  title={
                    <CopyableOntologyChip
                      hideOpenInNew
                      versionedUrl={versionedUrlFromComponents(
                        extractBaseUrl(dataTypeSchema.$id),
                        currentVersion,
                      )}
                    />
                  }
                >
                  <Typography
                    variant="h1"
                    fontWeight="bold"
                    ref={dataTypeTitleTextRef}
                    sx={{
                      lineHeight: 1.2,
                    }}
                  >
                    {dataTypeSchema.title}
                  </Typography>
                </Tooltip>
                {isInSlide && dataTypeTitleSize !== null && (
                  <Link
                    href={generateLinkParameters(dataTypeSchema.$id).href}
                    sx={{
                      position: "absolute",
                      left: dataTypeTitleSize.lastLineWidth + 20,
                      /**
                       * The vertical center of the text plus offset half the icon size
                       */
                      top:
                        dataTypeTitleSize.lastLineTop +
                        dataTypeTitleSize.lineHeight / 2 -
                        12,
                    }}
                    target="_blank"
                  >
                    <ArrowUpRightFromSquareRegularIcon
                      sx={{
                        fill: ({ palette }) => palette.blue[50],
                        fontSize: 24,
                        "&:hover": {
                          fill: ({ palette }) => palette.blue[70],
                        },
                      }}
                    />
                  </Link>
                )}
              </Box>
            </Stack>
          </Stack>
          <Stack direction="row" spacing={1.5}>
            {onEdit ? (
              <Button onClick={onEdit} variant="secondary" size="small">
                Edit <PenRegularIcon sx={{ fontSize: 14, ml: 1.5 }} />
              </Button>
            ) : null}
            <Button
              onClick={() => setShowExtendTypeDrawer(true)}
              variant="secondary"
              size="small"
            >
              Extend <ArrowUpRightIcon sx={{ fontSize: 16, ml: 1.5 }} />
            </Button>
          </Stack>
        </Stack>

        <Box sx={{ mb: 5.25 }}>
          <DataTypeDescription isReadOnly={isReadOnly} />
        </Box>
      </Box>
      {showExtendTypeDrawer && (
        <DataTypeEditorDrawer
          mode="create"
          initialExtendsDataTypeId={dataTypeSchema.$id}
          onClose={() => setShowExtendTypeDrawer(false)}
          onCreated={(createdDataType) => {
            setShowExtendTypeDrawer(false);
            void router.push(
              generateLinkParameters(createdDataType.schema.$id).href,
            );
            closeSlideStack();
          }}
        />
      )}
    </>
  );
};
