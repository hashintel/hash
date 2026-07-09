import { cva } from "@hashintel/ds-helpers/css";

/**
 * Event-handler props shared by the container of a radio/checkbox group.
 *
 * Focus events bubble, so moving between options would otherwise fire blur then
 * focus on the group itself. `onFocus`/`onBlur` only forward when focus
 * genuinely enters or leaves the group, i.e. when the related element is
 * outside it.
 *
 * `onMouseDown` addresses a related quirk: pressing an option's label blurs the
 * currently-focused option out to `<body>` (where `relatedTarget` is null)
 * before `click` focuses the pressed option — surfacing as the group losing
 * then regaining focus. Preventing the default press behaviour keeps the
 * current option focused until `click` moves focus straight to the pressed
 * option, so `relatedTarget` stays within the group and the transient never
 * happens.
 *
 * The result is spread onto the group's container element.
 */
export const getGroupFocusProps = ({
  onFocus,
  onBlur,
}: {
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
}): {
  onMouseDown: React.MouseEventHandler<HTMLDivElement>;
  onFocus: React.FocusEventHandler<HTMLDivElement>;
  onBlur: React.FocusEventHandler<HTMLDivElement>;
} => ({
  onMouseDown: (event) => {
    if ((event.target as HTMLElement).closest("label")) {
      event.preventDefault();
    }
  },
  onFocus: (event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      onFocus?.(event as unknown as React.FocusEvent<HTMLInputElement>);
    }
  },
  onBlur: (event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      onBlur?.(event as unknown as React.FocusEvent<HTMLInputElement>);
    }
  },
});

export const styles = cva({
  base: {
    display: "flex",
  },
  variants: {
    size: {
      xxs: {
        "--group-gap": "8px",
        "--group-inline-gap": "14px",
        "--group-padding-y": "8px",
        "--group-padding-left": "12px",
        "--group-padding-right": "12px",
        "--group-radius": "6px",
      },
      xs: {
        "--group-gap": "10px",
        "--group-inline-gap": "16px",
        "--group-padding-y": "10px",
        "--group-padding-left": "15px",
        "--group-padding-right": "18px",
        "--group-radius": "6px",
      },
      sm: {
        "--group-gap": "12px",
        "--group-inline-gap": "18px",
        "--group-padding-y": "11px",
        "--group-padding-left": "17px",
        "--group-padding-right": "22px",
        "--group-radius": "8px",
      },
      md: {
        "--group-gap": "14px",
        "--group-inline-gap": "20px",
        "--group-padding-y": "13px",
        "--group-padding-left": "19px",
        "--group-padding-right": "26px",
        "--group-radius": "8px",
      },
      lg: {
        "--group-gap": "16px",
        "--group-inline-gap": "24px",
        "--group-padding-y": "15px",
        "--group-padding-left": "22px",
        "--group-padding-right": "32px",
        "--group-radius": "10px",
      },
    },
    layout: {
      block: {
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "[var(--group-gap)]",
        width: "[fit-content]",

        "& > *": {
          width: "[100%]",
        },
      },
      inline: {
        flexWrap: "wrap",
        alignItems: "flex-start",
        columnGap: "[var(--group-inline-gap)]",
        rowGap: "[var(--group-gap)]",
      },
      blockWithBorder: {
        flexDirection: "column",
        border: "[1px solid var(--colors-neutral-s45)]",
        borderRadius: "[var(--group-radius)]",

        "& > *": {
          paddingBlock: "[var(--group-padding-y)]",
          paddingLeft: "[var(--group-padding-left)]",
          paddingRight: "[var(--group-padding-right)]",
          borderTop: "[1px solid var(--colors-neutral-s45)]",
          width: "[100%]",
          marginBlock: "[0 !important]",
        },

        "& > *:first-child": {
          borderTop: "none",
        },
      },
    },
  },
  defaultVariants: {
    size: "md",
    layout: "block",
  },
});
