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
        // as a direct child of a FormSection the fieldset box dissolves so
        // inlineControl subgrids onto the section's columns and adjacent
        // fields share label/input tracks (a fieldset cannot chain subgrids —
        // its anonymous content box breaks track sizing)
        root: {
          '[data-part="form-section"] > &': {
            display: "contents",
          },
        },
        // tracks mirror the section's: left labels, inputs, right labels —
        // identical standalone and subgridded, so item placement is the same
        // in both contexts
        inlineControl: {
          display: "grid",
          gridTemplateColumns: "[auto minmax(0, 1fr) auto]",
          columnGap: "5",
          alignItems: "center",
          '[data-part="form-section"] > * > &': {
            gridTemplateColumns: "[subgrid]",
            gridColumn: "[1 / -1]",
          },
        },
        label: {
          gridRow: "1",
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
        description: {
          '[data-part="form-section"] > * > &': { gridColumn: "[1 / -1]" },
        },
        descriptionBottom: {
          '[data-part="form-section"] > * > &': { gridColumn: "[1 / -1]" },
        },
        errors: {
          '[data-part="form-section"] > * > &': { gridColumn: "[1 / -1]" },
        },
      },
    },
    // physical side, resolved from start/end × labelDirection in the
    // component; targets inlineInput only, so it is inert in block layout
    inputAlign: {
      left: {},
      right: {
        inlineInput: { justifyContent: "flex-end" },
      },
    },
    // inline grid placement depends on these and lives in compoundVariants
    labelDirection: {
      left: {},
      right: {},
    },
    hideLabel: {
      true: {},
      false: {},
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
    // labelDirection mirrors the inline row: the label sits in its side's
    // auto track, the input spans from the opposite edge — absorbing the
    // unused side track and its gap, so an empty side costs no width
    {
      layout: "inline",
      labelDirection: "left",
      hideLabel: false,
      css: {
        label: { gridColumn: "[1]" },
        inlineInput: { gridColumn: "[2 / -1]" },
      },
    },
    {
      layout: "inline",
      labelDirection: "right",
      hideLabel: false,
      css: {
        label: { gridColumn: "[3]" },
        inlineInput: { gridColumn: "[1 / 3]" },
        inlineLabelActions: { order: "-1" },
      },
    },
    // a visually hidden label occupies no track: the input takes the full row
    {
      layout: "inline",
      hideLabel: true,
      css: {
        inlineInput: { gridColumn: "[1 / -1]" },
      },
    },
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
