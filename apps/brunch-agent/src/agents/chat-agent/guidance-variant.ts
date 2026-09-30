/** Server-start selection; never change arms within an existing conversation. */
export const guidanceVariantEnvironment = "BRUNCH_GUIDANCE_VARIANT";
export const guidanceVariants = [
  "baseline",
  "replacement",
  "feedback",
  "identity",
] as const;
export type GuidanceVariant = (typeof guidanceVariants)[number];

export const selectGuidanceVariant = (
  value = process.env[guidanceVariantEnvironment] ?? "baseline",
): GuidanceVariant => {
  const variant = guidanceVariants.find((candidate) => candidate === value);
  if (variant === undefined)
    throw new Error(
      `Expected guidance variant: ${guidanceVariants.join(" | ")}`,
    );
  return variant;
};
