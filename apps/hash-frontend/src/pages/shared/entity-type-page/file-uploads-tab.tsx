import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import {
  CheckIcon,
  CloseIcon,
  FontAwesomeIcon,
} from "@hashintel/design-system";
import type { CircularProgressProps, LinearProgressProps } from "@mui/material";
import {
  Box,
  CircularProgress,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import { useContext, useState } from "react";

import {
  useFileUploads,
  useFileUploadsProgress,
} from "../../../shared/file-upload-context";
import { SectionWrapper } from "../../[shortname]/shared/section-wrapper";
import { FileUploadDropzone } from "../../settings/shared/file-upload-dropzone";
import { WorkspaceContext } from "../workspace-context";
import { Action } from "./file-uploads-tab/action";
import { ShowUploadFormButton } from "./file-uploads-tab/show-upload-form-button";
import { useEntityType } from "./shared/entity-type-context";

const HeaderCell = ({ children }: { children: ReactNode }) => (
  <TableCell>
    <Typography variant="microText" fontWeight={600}>
      {children}
    </Typography>
  </TableCell>
);

export const FileUploadsTab = ({ isImage }: { isImage: boolean }) => {
  const entityType = useEntityType();

  const { uploads, uploadFile } = useFileUploads();

  const uploadsProgress = useFileUploadsProgress();

  const { activeWorkspaceOwnedById } = useContext(WorkspaceContext);

  const [showUploadForm, setShowUploadForm] = useState(!uploads.length);

  const onFileProvided = (file: File) => {
    void uploadFile({
      fileData: {
        fileEntityCreationInput: {
          entityTypeId: entityType.$id,
        },
        file,
      },
      makePublic: false,
      ownedById: activeWorkspaceOwnedById!,
    });
    setShowUploadForm(false);
  };

  return (
    <SectionWrapper
      title="Upload file"
      titleTooltip={`This table lists all ‘${entityType.title}’ uploads you created during this session`}
      tooltipIcon={
        <FontAwesomeIcon icon={faCircleQuestion} sx={{ fontSize: 14 }} />
      }
    >
      {showUploadForm && (
        <Box
          sx={({ palette }) => ({
            background: palette.gray[5],
            height: 250,
            mb: 2,
          })}
        >
          <FileUploadDropzone image={isImage} onFileProvided={onFileProvided} />
        </Box>
      )}
      {uploads.length ? (
        <Table
          sx={({ palette }) => ({
            background: palette.white,
            borderCollapse: "separate",
            borderRadius: 2,
            border: `1px solid ${palette.gray[30]}`,
            "thead th, tbody td": {
              padding: "8px 16px",
              "&:first-of-type": {
                paddingLeft: "24px",
              },
              "&:last-of-type": {
                paddingRight: "24px",
              },
              "&:not(:last-of-type)": {
                borderRight: `1px solid ${palette.gray[30]}`,
              },
            },
            th: {
              borderBottom: `1px solid ${palette.gray[30]}`,
            },
            "tfoot td": {
              borderBottomLeftRadius: 8,
              borderBottomRightRadius: 8,
              borderTop: `1px solid ${palette.gray[30]}}`,
            },
          })}
        >
          <TableHead>
            <TableRow>
              <HeaderCell>File</HeaderCell>
              <HeaderCell>Progress</HeaderCell>
              <HeaderCell>Actions</HeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {uploads.map((upload) => {
              const progressPercent = uploadsProgress[upload.requestId] ?? 0;

              const progressIndicatorProps = {
                color: upload.status === "error" ? "error" : "primary",
                variant: "determinate",
                value: progressPercent,
              } satisfies LinearProgressProps | CircularProgressProps;

              return (
                <TableRow key={upload.requestId}>
                  <TableCell sx={{ maxWidth: 600 }}>
                    <Typography
                      variant="smallTextLabels"
                      sx={{
                        display: "block",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        fontWeight: 500,
                      }}
                    >
                      {"file" in upload.fileData
                        ? upload.fileData.file.name
                        : upload.fileData.url.split("/").pop()}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ width: "60%", minWidth: 300 }}>
                    <Stack direction="row" alignItems="center">
                      <Stack
                        direction="row"
                        sx={{
                          alignItems: "center",
                          borderRadius: 4,
                          border: ({ palette }) =>
                            `1px solid ${palette.gray[30]}`,
                          px: 1.2,
                          py: 0.8,
                          minWidth: 76,
                        }}
                      >
                        {upload.status === "complete" ? (
                          <CheckIcon
                            sx={{ color: "blue.70", fontSize: 14, mr: 0.3 }}
                          />
                        ) : upload.status === "error" ? (
                          <CloseIcon
                            sx={{
                              fill: ({ palette }) => palette.pink[80],
                              fontSize: 11,
                              mr: 0.5,
                            }}
                          />
                        ) : (
                          <CircularProgress
                            {...progressIndicatorProps}
                            size={14}
                          />
                        )}
                        <Typography
                          variant="microText"
                          fontWeight={600}
                          lineHeight={1}
                          ml={0.5}
                        >
                          {upload.status === "error"
                            ? "Error"
                            : `${progressPercent.toFixed(0)}%`}
                        </Typography>
                      </Stack>
                      <LinearProgress
                        {...progressIndicatorProps}
                        sx={{ ml: 1.5, width: "100%" }}
                      />
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ textAlign: "center", width: 85 }}>
                    <Action
                      onRetry={() => uploadFile(upload)}
                      upload={upload}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3} sx={{ padding: 0 }}>
                <ShowUploadFormButton onClick={() => setShowUploadForm(true)} />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      ) : null}
    </SectionWrapper>
  );
};
