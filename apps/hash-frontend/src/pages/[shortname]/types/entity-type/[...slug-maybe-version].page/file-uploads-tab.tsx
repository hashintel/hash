import { faCircleQuestion } from "@fortawesome/free-regular-svg-icons";
import { faCirclePlus, FontAwesomeIcon } from "@hashintel/design-system";
import { OwnedById } from "@local/hash-subgraph";
import {
  Box,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useContext, useState } from "react";

import { useFileUploads } from "../../../../../shared/file-upload-context";
import { Button } from "../../../../../shared/ui/button";
import { FileUploadDropzone } from "../../../../settings/shared/file-upload-dropzone";
import { WorkspaceContext } from "../../../../shared/workspace-context";
import { SectionWrapper } from "../../../shared/section-wrapper";
import { useEntityType } from "./shared/entity-type-context";

const TextCell = ({ children }: { children: React.ReactNode }) => (
  <TableCell>
    <Typography variant="smallTextParagraphs">{children}</Typography>
  </TableCell>
);

export const FileUploadsTab = ({ isImage }: { isImage: boolean }) => {
  const entityType = useEntityType();

  const { uploads, uploadFile } = useFileUploads();

  const { activeWorkspaceAccountId } = useContext(WorkspaceContext);

  const relevantUploads = uploads.filter(
    (upload) => upload.fileData.entityTypeId === entityType.$id,
  );

  const [showUploadForm, setShowUploadForm] = useState(!relevantUploads.length);

  const onFileProvided = (file: File) => {
    void uploadFile({
      fileData: {
        entityTypeId: entityType.$id,
        file,
      },
      ownedById: activeWorkspaceAccountId as OwnedById,
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
      {relevantUploads.length ? (
        <Table
          sx={({ palette }) => ({
            background: palette.white,
            borderCollapse: "separate",
            borderRadius: 2,
            border: `1px solid ${palette.gray[30]}`,
            "thead th, tbody td": {
              padding: "12px 16px",
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
              <TextCell>File</TextCell>
              <TextCell>Progress</TextCell>
              <TextCell>Actions</TextCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {relevantUploads.map((upload) => (
              <TableRow key={upload.requestId}>
                <TextCell>
                  {"file" in upload.fileData
                    ? upload.fileData.file.name
                    : upload.fileData.url.split("/").pop()}
                </TextCell>
                <TableCell>
                  <LinearProgress variant="determinate" value={50} />
                </TableCell>
                <TableCell>
                  <Button size="small">Delete</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3} sx={{ padding: 0 }}>
                <Box
                  component="button"
                  onClick={() => setShowUploadForm(true)}
                  sx={{
                    alignItems: "center",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "center",
                    py: 2,
                    width: "100%",
                    "&:hover": {
                      span: {
                        color: "gray.70",
                      },
                      svg: {
                        color: "gray.70",
                      },
                    },
                  }}
                  type="button"
                >
                  <FontAwesomeIcon
                    icon={{
                      icon: faCirclePlus,
                    }}
                    sx={{
                      color: "gray.50",
                      fontSize: 12,
                      mr: 1,
                      transition: ({ transitions }) =>
                        transitions.create("color"),
                    }}
                  />
                  <Typography
                    variant="smallTextLabels"
                    sx={{
                      fontWeight: 500,
                      color: "gray.50",
                      transition: ({ transitions }) =>
                        transitions.create("color"),
                    }}
                  >
                    Upload another file
                  </Typography>
                </Box>
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      ) : null}
    </SectionWrapper>
  );
};
