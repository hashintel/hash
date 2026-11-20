import {
  getHashIconArtwork,
  type HashIconName,
} from "@hashintel/ds-icons/artwork";

const iconSvg = (name: HashIconName, color: string, size: number) => {
  const escaped = color.replace(
    /[&<>"']/g,
    (character) => `&#${character.charCodeAt(0)};`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" color="${escaped}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="2">${getHashIconArtwork(name)}</svg>`;
};
import { customColors } from "@hashintel/design-system/theme";

import type { SpriteProps } from "@glideapps/glide-data-grid";

export const customGridIcons = {
  bpAsteriskCircle: ({ fgColor }) => iconSvg("circleAsterisk", fgColor, 14),
  bpError: () => iconSvg("error", customColors.red[70], 14),
  bpLabel: ({ fgColor }) => iconSvg("circleTag", fgColor, 14),
  bpAsterisk: ({ fgColor }) => iconSvg("asterisk", fgColor, 16),
  bpChevronDown: ({ fgColor }) => iconSvg("chevronDown", fgColor, 16),
  bpChevronRight: ({ fgColor }) => iconSvg("chevronRight", fgColor, 16),
  bpCheck: ({ fgColor }) => iconSvg("check", fgColor, 16),
  bpCross: ({ fgColor }) => iconSvg("close", fgColor, 16),
  bpList: ({ fgColor }) => iconSvg("list", fgColor, 16),
  bpLink: ({ fgColor }) => iconSvg("link", fgColor, 16),
  bpTrash: ({ fgColor }) => iconSvg("trash", fgColor, 16),
  bpRightLeft: ({ fgColor }) => iconSvg("arrowsLeftRight", fgColor, 16),
  bpTypeBoolean: ({ fgColor }) => iconSvg("squareCheck", fgColor, 16),
  bpTypeText: ({ fgColor }) => iconSvg("text", fgColor, 16),
  bpTypeNumber: ({ fgColor }) => iconSvg("oneHundred", fgColor, 16),
  bpBracketsCurly: ({ fgColor }) => iconSvg("bracketsCurly", fgColor, 16),
  bpBracketsSquare: ({ fgColor }) => iconSvg("bracketsSquare", fgColor, 16),
  bpEmptySet: ({ fgColor }) => iconSvg("emptySet", fgColor, 16),
  inputPipeRegular: ({ fgColor }) => iconSvg("inputPipe", fgColor, 20),
  atRegular: ({ fgColor }) => iconSvg("at", fgColor, 16),
  rulerRegular: ({ fgColor }) => iconSvg("ruler", fgColor, 16),
  arrowUpAzLight: ({ fgColor }) => iconSvg("sortUpAlphabetical", fgColor, 18),
  arrowDownAzLight: ({ fgColor }) =>
    iconSvg("sortDownAlphabetical", fgColor, 18),
  arrowUpRightRegular: ({ fgColor }) => iconSvg("arrowUpRight", fgColor, 24),
  filterLight: ({ fgColor }) => iconSvg("filter", fgColor, 16),
  calendarRegular: ({ fgColor }) => iconSvg("calendar", fgColor, 14),
  clockRegular: ({ fgColor }) => iconSvg("clock", fgColor, 16),
  calendarClockRegular: ({ fgColor }) => iconSvg("calendarClock", fgColor, 18),
  userRegular: ({ fgColor }) => iconSvg("user", fgColor, 24),
  wandMagicSparklesRegular: ({ fgColor }) => iconSvg("magic", fgColor, 15),
  hashSolid: ({ fgColor }) =>
    `<svg width="16" height="16" viewBox="0 0 18 16" fill="none" xmlns="http://www.w3.org/2000/svg" ><path fill="${fgColor}" fill-rule="evenodd" clip-rule="evenodd" d="M7.96667 16H3.66667V13.1889H0.900002V8.88889H3.66667V6.96666H0.900002V2.66666H3.66667V0H7.96667V2.66666H9.88889V0H14.1889V2.66666H17.1V6.96666H14.1889V8.88889H17.1V13.1889H14.1889V16H9.88889V13.1889H7.96667V16ZM7.96667 8.88889H9.88889V6.96666H7.96667V8.88889Z" /></svg>`,
  warning: ({ fgColor }) => iconSvg("warning", fgColor, 24),
  arrowRotateLeft: ({ fgColor }) => iconSvg("reset", fgColor, 24),
  equalsRegular: ({ fgColor }) => iconSvg("equals", fgColor, 24),
} as const satisfies Record<string, (props: SpriteProps) => string>;

export type CustomIcon = keyof typeof customGridIcons;
