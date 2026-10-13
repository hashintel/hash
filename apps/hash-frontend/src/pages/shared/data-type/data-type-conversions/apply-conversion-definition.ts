import type {
  ConversionDefinition,
  Conversions,
} from "@blockprotocol/type-system";

export const applyConversionDefinition = ({
  conversions,
  definition,
  direction,
}: {
  conversions: Conversions;
  definition: ConversionDefinition;
  direction: "from" | "to";
}): Conversions => ({
  from: direction === "from" ? definition : conversions.from,
  to: direction === "to" ? definition : conversions.to,
});
