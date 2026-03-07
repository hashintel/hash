export const compactNodeDimensions = {
  place: { width: 180, height: 48 },
  transition: { width: 180, height: 48 },
};

export const classicNodeDimensions = {
  place: { width: 130, height: 130 },
  transition: { width: 160, height: 80 },
};

/** @deprecated Use compactNodeDimensions or classicNodeDimensions */
export const nodeDimensions = compactNodeDimensions;

export const handleStyling = {
  background: "#6b7280",
  width: 9,
  height: 9,
  borderRadius: "50%",
  zIndex: 3,
};
