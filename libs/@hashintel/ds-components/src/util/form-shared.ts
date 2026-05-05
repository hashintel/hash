export const formInputSizes = ["xxs", "xs", "sm", "md", "lg"] as const;
export type FormInputSize = (typeof formInputSizes)[number];
