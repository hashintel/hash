import { Box } from "@mui/material";
import {
  Children,
  cloneElement,
  FunctionComponent,
  isValidElement,
  ReactElement,
  ReactNode,
} from "react";

import { InfoCard } from "./info-card";

type InfoCardWrapperProps = {
  children?: ReactNode;
};

export const INFO_CARD_WIDTH = 275;

export const InfoCardWrapper: FunctionComponent<InfoCardWrapperProps> = ({
  children,
}) => {
  const childrenAsArray = Children.toArray(children);
  const infoCardElements = childrenAsArray.filter(
    (child) => isValidElement(child) && child.type === InfoCard,
  );

  if (infoCardElements.length !== 1) {
    throw new Error(
      `Expected InfoCardWrapper to contain exactly one InfoCard, got ${infoCardElements.length}`,
    );
  }
  const infoCardElement = infoCardElements[0] as ReactElement;

  const childrenWithoutInfoCard = childrenAsArray.filter(
    (child) => child !== infoCardElement,
  );

  return (
    <Box
      display="flex"
      className="info-card-wrapper"
      sx={{
        flexDirection: {
          xs: "column",
          sm: "row",
        },
      }}
    >
      <Box
        sx={{
          "& > :first-of-type": {
            marginTop: 0,
          },
        }}
      >
        {childrenWithoutInfoCard}
      </Box>
      <Box
        sx={{
          marginLeft: {
            xs: 0,
            sm: 4,
          },
          marginBottom: {
            xs: 2,
            sm: 0,
          },
        }}
      >
        {cloneElement(infoCardElement, {
          sx: {
            width: {
              xs: "unset",
              sm: INFO_CARD_WIDTH,
            },
          },
        })}
      </Box>
    </Box>
  );
};
