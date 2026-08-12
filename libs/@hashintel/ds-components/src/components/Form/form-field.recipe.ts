import { sva } from "@hashintel/ds-helpers/css";

import { srOnly } from "../../util/css-mixins";

export const styles = sva({
  slots: [
    "root",
    "legend",
    "label",
    "inlineControl",
    "inlineInput",
    "inlineLabelActions",
    "description",
    "descriptionBottom",
    "errors",
  ],
  base: {
    // hidden real <legend> naming the fieldset in inline layout, where the
    // visible label sits inside inlineControl and cannot do so
    legend: srOnly,
  },
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
        inlineControl: {
          display: "grid",
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
    // labelDirection mirrors the inline row: label track last, actions before
    // the input
    {
      layout: "inline",
      labelDirection: "left",
      hideLabel: false,
      css: {
        inlineControl: { gridTemplateColumns: "[auto minmax(0, 1fr)]" },
        label: { gridColumn: "1" },
        inlineInput: { gridColumn: "[2]" },
      },
    },
    {
      layout: "inline",
      labelDirection: "right",
      hideLabel: false,
      css: {
        inlineControl: { gridTemplateColumns: "[minmax(0, 1fr) auto]" },
        label: { gridColumn: "[2]" },
        inlineInput: { gridColumn: "1" },
        inlineLabelActions: { order: "-1" },
      },
    },
    // a visually hidden label leaves no label track: the input takes the full
    // row (spanning all section columns when subgridded) with no phantom gap
    {
      layout: "inline",
      hideLabel: true,
      css: {
        inlineControl: { gridTemplateColumns: "[minmax(0, 1fr)]" },
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
