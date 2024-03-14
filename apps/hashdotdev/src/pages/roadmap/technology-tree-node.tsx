import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import type { FunctionComponent, RefObject } from "react";
import { Fragment } from "react";

import { CircleInfoRegularIcon } from "../../components/icons/circle-info-regular-icon";
import { statuses } from "./statuses";
import type { TechnologyTreeNodeData } from "./technology-tree-data";
import { useCases } from "./use-cases";
import { variants } from "./variants";

export const technologyTreeNodeWidth = 300;

export const TechnologyTreeNode: FunctionComponent<{
  graphWrapperRef: RefObject<Element>;
  x: number;
  y: number;
  blurred: boolean;
  data: TechnologyTreeNodeData;
  selected: boolean;
  onSelected: () => void;
  onDeselected: () => void;
}> = ({
  graphWrapperRef,
  x,
  y,
  blurred,
  data: { heading, body, ...data },
  selected,
  onSelected,
  onDeselected,
}) => {
  const useCaseNames = data.useCases.map(
    (useCaseId) => useCases.find(({ id }) => id === useCaseId)?.name,
  );

  const variant = variants.find(({ id }) => id === data.variant)!;

  const status = statuses.find(({ id }) => id === data.status)!;

  return (
    <Box
      sx={{
        left: y,
        top: x,
        opacity: blurred ? 0.25 : 1,
        position: "absolute",
        transform: "translate(-50%, -50%)",
        width: technologyTreeNodeWidth,
        background: status.backgroundColor,
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
        marginBottom={1.2}
      >
        <Typography
          sx={{
            fontSize: 15,
            lineHeight: 1.2,
            fontWeight: 600,
            color: status.headingColor,
            marginRight: 1,
          }}
        >
          {heading}
        </Typography>
        <Tooltip
          PopperProps={{ container: graphWrapperRef.current }}
          open={selected}
          title={
            <>
              Use cases:{" "}
              {useCaseNames.length > 1
                ? useCaseNames
                    .slice(0, -1)
                    .map((item) => (
                      <Fragment key={item?.toString()}>{item}, </Fragment>
                    ))
                    .concat(
                      <Fragment key="last">
                        {" "}
                        & {useCaseNames.slice(-1)}
                      </Fragment>,
                    )
                : useCaseNames[0]}
            </>
          }
        >
          <IconButton
            sx={{ padding: 0, position: "relative", top: 3 }}
            onClick={onSelected}
            onBlur={onDeselected}
          >
            <CircleInfoRegularIcon
              sx={{ color: status.infoIconColor, fontSize: 14 }}
            />
          </IconButton>
        </Tooltip>
      </Box>
      <Typography
        sx={{
          fontSize: 14,
          fontWeight: 400,
          lineHeight: 1.2,
          color: status.bodyColor,
        }}
      >
        {body}
      </Typography>
      <Box display="flex" justifyContent="space-between" marginTop={1.5}>
        <Box
          display="flex"
          alignItems="center"
          sx={{
            svg: {
              fontSize: 14,
              color: status.typeColor,
            },
          }}
        >
          {variant.icon}
          <Typography
            sx={{
              marginLeft: 0.8,
              fontSize: 13,
              fontWeight: 500,
              color: status.typeColor,
            }}
          >
            {variant.name}
          </Typography>
        </Box>
        <Box
          display="flex"
          alignItems="center"
          sx={{ svg: { fontSize: 14, color: status.statusColor } }}
        >
          {status.icon}
          <Typography
            sx={{
              marginLeft: 0.8,
              fontSize: 13,
              fontWeight: 500,
              color: status.statusColor,
            }}
          >
            {status.name}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};
