import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { FunctionComponent } from "react";

import { FaIcon } from "../../components/icons/fa-icon";
import { BlockProtocolIcon } from "./block-protocol-icon";
import { TechnologyTreeNodeData } from "./technology-tree-data";
import { useCases } from "./use-cases";

export const technologyTreeNodeWidth = 300;
export const technologyTreeNodeMinHeight = 115;

export const TechnologyTreeNode: FunctionComponent<{
  x: number;
  y: number;
  blurred: boolean;
  data: TechnologyTreeNodeData;
  onHover: () => void;
  onUnhover: () => void;
}> = ({
  x,
  y,
  blurred,
  data: { variant, heading, body, status, ...data },
  onHover,
  onUnhover,
}) => {
  const useCaseNames = data.useCases.map(
    (useCaseId) => useCases.find(({ id }) => id === useCaseId)?.name,
  );

  return (
    <Box
      sx={{
        left: y,
        top: x,
        opacity: blurred ? 0.25 : 1,
        position: "absolute",
        transform: "translate(-50%, -50%)",
        width: technologyTreeNodeWidth,
        background: ({ palette }) =>
          status === "done" ? palette.teal[10] : palette.white,
        borderRadius: "8px",
        borderColor: ({ palette }) => palette.gray[30],
        borderWidth: 1,
        borderStyle: "solid",
        padding: 2.25,
      }}
    >
      <Box
        display="flex"
        alignItems="flex-start"
        justifyContent="space-between"
        marginBottom={1}
      >
        <Typography
          sx={{
            fontSize: 15,
            lineHeight: 1.2,
            fontWeight: 500,
            color: ({ palette }) =>
              status === "done" ? palette.teal[80] : palette.gray[90],
          }}
        >
          {heading}
          <FaIcon
            name="arrow-right"
            type="solid"
            sx={{
              fontSize: 14,
              marginLeft: 1,
              color: ({ palette }) =>
                status === "done" ? palette.teal[40] : palette.gray[40],
            }}
          />
        </Typography>
        <Tooltip
          title={
            <>
              Use cases:{" "}
              {useCaseNames.length > 1
                ? useCaseNames
                    .slice(0, -1)
                    .join(", ")
                    .concat(` & ${useCaseNames.slice(-1)}`)
                : useCaseNames[0]}
            </>
          }
        >
          <IconButton
            sx={{ padding: 0 }}
            onPointerOver={onHover}
            onPointerLeave={onUnhover}
          >
            <FaIcon name="circle-info" type="regular" sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Typography
        sx={{
          fontSize: 14,
          fontWeight: 400,
          lineHeight: 1.2,
          color: ({ palette }) => palette.black,
        }}
      >
        {body}
      </Typography>
      <Box display="flex" justifyContent="space-between" marginTop={1.5}>
        <Box display="flex" alignItems="center">
          {variant === "block-protocol" ? (
            <BlockProtocolIcon
              sx={{ fontSize: 12, color: ({ palette }) => palette.teal[90] }}
            />
          ) : (
            <FaIcon
              name={
                variant === "experiment"
                  ? "vial"
                  : variant === "feature"
                  ? "sparkles"
                  : "server"
              }
              type="regular"
              sx={{ fontSize: 14, color: ({ palette }) => palette.teal[90] }}
            />
          )}
          <Typography
            sx={{
              marginLeft: 0.5,
              fontSize: 13,
              fontWeight: 500,
              color: ({ palette }) => palette.teal[90],
            }}
          >
            {variant === "block-protocol"
              ? "Block Protocol"
              : variant === "experiment"
              ? "Experiment"
              : variant === "feature"
              ? "Feature"
              : "Infrastructure"}
          </Typography>
        </Box>
        <Box display="flex" alignItems="center">
          <FaIcon
            name={
              status === "done"
                ? "circle-check"
                : status === "future"
                ? "radar"
                : status === "in-progress"
                ? "circle-half-stroke"
                : "circle-arrow-right"
            }
            type="regular"
            sx={{
              fontSize: 14,
              color: ({ palette }) =>
                status === "done"
                  ? palette.teal[90]
                  : status === "next-up"
                  ? palette.teal[50]
                  : status === "in-progress"
                  ? palette.teal[70]
                  : palette.gray[50],
            }}
          />
          <Typography
            sx={{
              marginLeft: 0.5,
              fontSize: 13,
              fontWeight: 500,
              color: ({ palette }) =>
                status === "done"
                  ? palette.teal[90]
                  : status === "next-up"
                  ? palette.teal[50]
                  : status === "in-progress"
                  ? palette.teal[70]
                  : palette.gray[50],
            }}
          >
            {status === "done"
              ? "Done"
              : status === "future"
              ? "Future"
              : status === "in-progress"
              ? "In Progress"
              : "Next Up"}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};
