export const formInputSizes = ["xs", "sm", "md", "lg"] as const;
export type FormInputSize = (typeof formInputSizes)[number];
