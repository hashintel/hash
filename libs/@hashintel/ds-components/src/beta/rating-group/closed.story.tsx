import { forwardRef, type ReactElement, type ReactNode } from "react";

import * as StyledRatingGroup from "./rating-group";

export interface RatingProps extends StyledRatingGroup.RootProps {
  icon?: ReactElement;
  count?: number;
  label?: ReactNode;
}

export const RatingGroup = forwardRef<HTMLDivElement, RatingProps>(
  (props, ref) => {
    const { icon, count = 5, label, ...rest } = props;
    return (
      <StyledRatingGroup.Root ref={ref} count={count} {...rest}>
        {label && <StyledRatingGroup.Label>{label}</StyledRatingGroup.Label>}
        <StyledRatingGroup.HiddenInput />
        <StyledRatingGroup.Control>
          <StyledRatingGroup.Items icon={icon} />
        </StyledRatingGroup.Control>
      </StyledRatingGroup.Root>
    );
  },
);
