import type { SDCPN } from "../core/types/sdcpn";
import {
  convertPre20251128ToSDCPN,
  isPre20251128SDCPN,
} from "./pre-2025-11-28/convert";
import type { Pre20251128SDCPN } from "./pre-2025-11-28/type";

export type OldFormat = Pre20251128SDCPN;

export const convertOldFormatToSDCPN = (
  sdcpn: SDCPN | OldFormat,
): SDCPN | null => {
  if (isPre20251128SDCPN(sdcpn)) {
    return convertPre20251128ToSDCPN(sdcpn);
  }

  return null;
};
