import type { DataType } from "@blockprotocol/type-system/slim";
import { extractVersion } from "@blockprotocol/type-system/slim";
import { ArrowUpRightIcon } from "@hashintel/design-system";
import {
  extractBaseUrl,
  versionedUrlFromComponents,
} from "@local/hash-subgraph/type-system-patch";
import { Box, Stack, Typography } from "@mui/material";
import { useState } from "react";

import { Button, Link, Modal } from "../../../shared/ui";
import { CopyableOntologyChip } from "../copyable-ontology-chip";
import { CreateDataTypeForm } from "../create-data-type-form";
import { DataTypeDescription } from "./data-type-header/data-type-description";

interface DataTypeHeaderProps {
  currentVersion: number;
  dataTypeSchema: DataType;
  hideOpenInNew?: boolean;
  isDraft: boolean;
  isPreviewSlide?: boolean;
  isReadOnly: boolean;
  latestVersion?: number | null;
}

export const DataTypeHeader = ({
  currentVersion,
  dataTypeSchema,
  hideOpenInNew,
  isDraft,
  isPreviewSlide,
  isReadOnly,
  latestVersion,
}: DataTypeHeaderProps) => {
  const [showExtendTypeModal, setShowExtendTypeModal] = useState(false);

  const isLatest =
    !latestVersion || extractVersion(dataTypeSchema.$id) === latestVersion;

  const latestVersionUrl = versionedUrlFromComponents(
    extractBaseUrl(dataTypeSchema.$id),
    latestVersion ?? 0,
  );

  return (
    <>
      <Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <CopyableOntologyChip
            hideOpenInNew={hideOpenInNew}
            versionedUrl={versionedUrlFromComponents(
              extractBaseUrl(dataTypeSchema.$id),
              currentVersion,
            )}
          />

          {!isLatest && (
            <Link
              href={latestVersionUrl}
              sx={{
                textDecoration: "none",
              }}
            >
              <Typography
                color="inherit"
                sx={{ fontSize: 11, fontWeight: 600 }}
              >
                {`–> v${latestVersion} available`}
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
            <Box my={3}>
              <Typography variant="h1" fontWeight="bold">
                {dataTypeSchema.title}
              </Typography>
            </Box>
          </Stack>
          {!isDraft && !isPreviewSlide ? (
            <Button
              onClick={() => setShowExtendTypeModal(true)}
              variant="secondary"
              size="small"
            >
              Extend type <ArrowUpRightIcon sx={{ fontSize: 16, ml: 1.5 }} />
            </Button>
          ) : null}
        </Stack>

        <Box sx={{ mb: 5.25 }}>
          <DataTypeDescription isReadOnly={isReadOnly} />
        </Box>
      </Box>
      <Modal open={showExtendTypeModal} contentStyle={{ p: { xs: 0, md: 0 } }}>
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
