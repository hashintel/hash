import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: [
    "root",
    "label",
    "inlineControl",
    "inlineInput",
    "inlineLabelActions",
    "description",
    "descriptionBottom",
    "errors",
  ],
  base: {},
  variants: {
    layout: {
      block: {},
      inline: {
        root: {},
        inlineControl: {
          display: "grid",
          gridTemplateColumns: "[auto minmax(0, 1fr)]",
          columnGap: "5",
          alignItems: "center",
        },
        // float takes a <legend> out of its special fieldset rendering so it
        // participates in the grid; it has no effect on grid-item <label>s
        label: {
          gridColumn: "1",
          gridRow: "1",
          float: "[left]",
          marginBottom: "0!",
        },
        inlineInput: {
          display: "flex",
          gap: "2",
          alignItems: "center",
        },
        inlineLabelActions: {
          display: "inline-flex",
          alignItems: "center",
          gap: "1",
        },
      },
    },
    size: {
      xxs: {
        label: {
          marginBottom: "0",
          '&:has(+ [data-part="description"])': { marginBottom: "-1" },
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
          '&:has(+ [data-part="description"])': { marginBottom: "-0.5" },
        },
        description: { marginBottom: "1" },
        descriptionBottom: { marginTop: "1" },
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
        descriptionBottom: { marginTop: "1.5" },
        errors: {
          marginTop: "1.5",
          '[data-part="descriptionBottom"] + &': { marginTop: "1" },
        },
      },
      lg: {
        label: {
          marginBottom: "2",
          '&:has(+ [data-part="description"])': { marginBottom: "0" },
        },
        description: { marginBottom: "2" },
        descriptionBottom: { marginTop: "2" },
        errors: {
          marginTop: "2",
          '[data-part="descriptionBottom"] + &': { marginTop: "1.5" },
        },
      },
    },
  },
  // inline layout: slightly tighter gaps between inlineControl and its neighbours
  compoundVariants: [
    {
      layout: "inline",
      size: "xxs",
      css: {
        descriptionBottom: { marginTop: "0.5" },
        errors: { marginTop: "0.5" },
      },
    },
    {
      layout: "inline",
      size: "xs",
      css: {
        description: { marginBottom: "0.5" },
        descriptionBottom: { marginTop: "0.5" },
        errors: { marginTop: "0.5" },
      },
    },
    {
      layout: "inline",
      size: "sm",
      css: {
        descriptionBottom: { marginTop: "0.5" },
        errors: { marginTop: "0.5" },
      },
    },
    {
      layout: "inline",
      size: "md",
      css: {
        description: { marginBottom: "0.5" },
        descriptionBottom: { marginTop: "0.5" },
        errors: { marginTop: "0.5" },
      },
    },
    {
      layout: "inline",
      size: "lg",
      css: {
        description: { marginBottom: "1.5" },
        descriptionBottom: { marginTop: "1.5" },
        errors: { marginTop: "1.5" },
      },
    },
  ],
});
