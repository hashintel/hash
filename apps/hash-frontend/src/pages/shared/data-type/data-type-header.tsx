import type { DataType, OntologyTypeVersion } from "@blockprotocol/type-system";
import {
  extractBaseUrl,
  extractVersion,
  makeOntologyTypeVersion,
  versionedUrlFromComponents,
} from "@blockprotocol/type-system";
import {
  ArrowUpRightFromSquareRegularIcon,
  ArrowUpRightIcon,
} from "@hashintel/design-system";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { useRef, useState } from "react";

import { generateLinkParameters } from "../../../shared/generate-link-parameters";
import { Button, Link, Modal } from "../../../shared/ui";
import { CopyableOntologyChip } from "../copyable-ontology-chip";
import { CreateDataTypeForm } from "../create-data-type-form";
import { useSlideStack } from "../slide-stack";
import { useTextSize } from "../use-text-size";
import { DataTypeDescription } from "./data-type-header/data-type-description";

interface DataTypeHeaderProps {
  currentVersion: OntologyTypeVersion;
  dataTypeSchema: DataType;
  isDraft: boolean;
  isInSlide?: boolean;
  isReadOnly: boolean;
  latestVersion?: OntologyTypeVersion | null;
}

export const DataTypeHeader = ({
  currentVersion,
  dataTypeSchema,
  isDraft,
  isInSlide,
  isReadOnly,
  latestVersion,
}: DataTypeHeaderProps) => {
  const [showExtendTypeModal, setShowExtendTypeModal] = useState(false);

  const isLatest =
    !latestVersion || extractVersion(dataTypeSchema.$id) === latestVersion;

  const latestVersionUrl = versionedUrlFromComponents(
    extractBaseUrl(dataTypeSchema.$id),
    latestVersion ?? makeOntologyTypeVersion({ major: 0 }),
  );

  const { slideContainerRef, pushToSlideStack } = useSlideStack();

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
          {!isDraft ? (
            <Button
              onClick={() => setShowExtendTypeModal(true)}
              variant="secondary"
              size="small"
            >
              Extend <ArrowUpRightIcon sx={{ fontSize: 16, ml: 1.5 }} />
            </Button>
          ) : null}
        </Stack>

        <Box sx={{ mb: 5.25 }}>
          <DataTypeDescription isReadOnly={isReadOnly} />
        </Box>
      </Box>
      <Modal
        open={showExtendTypeModal}
        contentStyle={{ p: { xs: 0, md: 0 }, maxWidth: 500 }}
      >
        <>
          <Typography
            sx={({ palette }) => ({
              color: palette.gray[80],
              fontWeight: 500,
              px: 2.5,
              pt: 2,
              pb: 1.5,
            })}
          >
            Create new data type
          </Typography>
          <Box>
            <CreateDataTypeForm
              afterSubmit={() => setShowExtendTypeModal(false)}
              inModal
              initialData={{ extendsDataTypeId: dataTypeSchema.$id }}
              onCancel={() => setShowExtendTypeModal(false)}
            />
          </Box>
        </>
      </Modal>
    </>
  );
};
