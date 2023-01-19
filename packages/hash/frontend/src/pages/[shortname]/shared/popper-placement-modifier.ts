import { PopperProps } from "@mui/material";
import { Theme } from "@mui/system";
import { SystemStyleObject } from "@mui/system/styleFunctionSx/styleFunctionSx";

const popperPositionDataAttribute = "data-popper-placement";

export const popperPlacementSelectors = {
  top: `[${popperPositionDataAttribute}="top"]`,
  bottom: `[${popperPositionDataAttribute}="bottom"]`,
  topStart: `[${popperPositionDataAttribute}="top-start"]`,
  topEnd: `[${popperPositionDataAttribute}="top-end"]`,
  bottomStart: `[${popperPositionDataAttribute}="bottom-start"]`,
  bottomEnd: `[${popperPositionDataAttribute}="bottom-end"]`,
};

export const setPopperPlacementAttribute = (
  node: HTMLElement,
  placement: PopperProps["placement"],
) => {
  node.setAttribute(popperPositionDataAttribute, placement);
};

export const addPopperPositionClassPopperModifier: NonNullable<
  PopperProps["modifiers"]
>[number] = {
  name: "addPositionClass",
  enabled: true,
  phase: "write",
  fn({ state, options }) {
    if (state.elements.reference instanceof HTMLElement) {
      setPopperPlacementAttribute(state.elements.reference, state.placement);
    }
    const { update } = options;
    if (typeof update === "function") {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      update(state.placement);
    }
  },
};

export const popperPlacementInputNoRadius: SystemStyleObject<Theme> = {
  [`&${popperPlacementSelectors.bottom}, &${popperPlacementSelectors.bottomStart}, ${popperPlacementSelectors.bottom} &, ${popperPlacementSelectors.bottomStart} &`]:
    {
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
    },
  [`&${popperPlacementSelectors.top}, &${popperPlacementSelectors.topStart}, ${popperPlacementSelectors.top} &, ${popperPlacementSelectors.topStart} &`]:
    {
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
    },
};

export const popperPlacementPopperNoRadius: SystemStyleObject<Theme> = {
  [`&${popperPlacementSelectors.top}, &${popperPlacementSelectors.topStart}, ${popperPlacementSelectors.top} &, ${popperPlacementSelectors.topStart} &`]:
    {
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
    },
  [`&${popperPlacementSelectors.bottom}, &${popperPlacementSelectors.bottomStart}, ${popperPlacementSelectors.bottom} &, ${popperPlacementSelectors.bottomStart} &`]:
    {
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
    },
};

export const popperPlacementInputNoBorder: SystemStyleObject<Theme> = {
  [`&${popperPlacementSelectors.bottom}`]: {
    borderBottom: 0,
  },
  [`&${popperPlacementSelectors.top}`]: {
    borderTop: 0,
  },
};
