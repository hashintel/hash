export const chipSizes = ["xxs", "xs", "sm", "md", "lg", "xl"] as const;

export type ChipSize = (typeof chipSizes)[number];
