import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["label", "description", "descriptionBottom", "errors"],
  base: {},
  variants: {
    size: {
      xxs: {
        label: {
          marginBottom: "0",
          '&:has(+ [data-part="description"])': { marginBottom: "-0.5" },
        },
        description: { marginBottom: "0.5" },
        descriptionBottom: { marginTop: "1" },
        errors: { marginTop: "1" },
      },
      xs: {
        label: {
          marginBottom: "0",
          '&:has(+ [data-part="description"])': { marginBottom: "-1" },
        },
        description: { marginBottom: "0" },
        descriptionBottom: { marginTop: "1" },
        errors: {
          marginTop: "1",
          '[data-part="descriptionBottom"] + &': { marginTop: "0.5" },
        },
      },
      sm: {
        label: {
          marginBottom: "1",
          '&:has(+ [data-part="description"])': { marginBottom: "-1" },
        },
        description: { marginBottom: "1" },
        descriptionBottom: { marginTop: "1.5" },
        errors: {
          marginTop: "1.5",
          '[data-part="descriptionBottom"] + &': { marginTop: "1" },
        },
      },
      md: {
        label: {
          marginBottom: "1.5",
          '&:has(+ [data-part="description"])': { marginBottom: "-0.5" },
        },
        description: { marginBottom: "1.5" },
        descriptionBottom: { marginTop: "2" },
        errors: {
          marginTop: "2",
          '[data-part="descriptionBottom"] + &': { marginTop: "1.5" },
        },
      },
      lg: {
        label: {
          marginBottom: "2",
          '&:has(+ [data-part="description"])': { marginBottom: "0" },
        },
        description: { marginBottom: "2" },
        descriptionBottom: { marginTop: "2.5" },
        errors: {
          marginTop: "2",
          '[data-part="descriptionBottom"] + &': { marginTop: "1.5" },
        },
      },
    },
  },
});
