import type { SDCPN } from "../../core/types/sdcpn";
import type { Pre20251128SDCPN } from "./type";

export const isPre20251128SDCPN = (
  sdcpn: unknown,
): sdcpn is Pre20251128SDCPN => {
  return typeof sdcpn === "object" && sdcpn !== null && "id" in sdcpn;
};

export const convertPre20251128ToSDCPN = (old: Pre20251128SDCPN): SDCPN => {
  const { id: _id, title: _title, ...cloned } = structuredClone(old);

  return {
    ...cloned,
    places: cloned.places.map(({ width: _w, height: _h, ...place }) => ({
      ...place,
      colorId: place.type,
      dynamicsEnabled: place.dynamicsEnabled,
      differentialEquationId: place.differentialEquationCode?.refId ?? null,
    })),
    transitions: cloned.transitions.map(
      ({ width: _w, height: _h, ...transition }) => transition,
    ),
    types: cloned.types.map((type) => ({
      ...type,
      iconSlug: type.iconId,
      displayColor: type.colorCode,
      elements: type.elements.map((element) => ({
        ...element,
        elementId: element.id,
      })),
    })),
    differentialEquations: cloned.differentialEquations.map(
      (differentialEquation) => ({
        ...differentialEquation,
        colorId: differentialEquation.typeId,
      }),
    ),
  };
};
