import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  className: "formField",
  slots: ["label", "description", "descriptionBottom", "errors"],
  base: {
    label: {
      marginBottom: "2",
      '&:has(+ [class~="formField__description"])': {
        marginBottom: "1",
      },
    },
    description: {
      marginBottom: "2",
    },
    descriptionBottom: {
      marginTop: "2",
    },
    errors: {
      marginTop: "2",
      '[class~="formField__descriptionBottom"] + &': {
        marginTop: "1",
      },
    },
  },
  variants: {
    size: {
      xxs: {
        label: {
          marginBottom: "1",
          '&:has(+ [class~="formField__description"])': {
            marginBottom: "0.5",
          },
        },
        description: { marginBottom: "1" },
        descriptionBottom: { marginTop: "1" },
        errors: {
          marginTop: "1",
          '[class~="formField__descriptionBottom"] + &': {
            marginTop: "0.5",
          },
        },
      },
      xs: {
        label: {
          marginBottom: "1.5",
          '&:has(+ [class~="formField__description"])': {
            marginBottom: "0.5",
          },
        },
        description: { marginBottom: "1.5" },
        descriptionBottom: { marginTop: "1.5" },
        errors: {
          marginTop: "1.5",
          '[class~="formField__descriptionBottom"] + &': {
            marginTop: "0.5",
          },
        },
      },
      sm: {},
      md: {},
      lg: {
        label: {
          marginBottom: "2.5",
          '&:has(+ [class~="formField__description"])': {
            marginBottom: "1",
          },
        },
        description: { marginBottom: "2.5" },
        descriptionBottom: { marginTop: "2.5" },
        errors: {
          marginTop: "2.5",
          '[class~="formField__descriptionBottom"] + &': {
            marginTop: "1.5",
          },
        },
      },
    },
  },
});
