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
    layout: {
      block: {
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "[12px]",
        width: "[fit-content]",

        "& > *": {
          width: "[100%]",
        },
      },
      inline: {
        flexWrap: "wrap",
        alignItems: "flex-start",
        columnGap: "[20px]",
        rowGap: "[10px]",
      },
      blockWithBorder: {
        flexDirection: "column",
        border: "[1px solid var(--colors-neutral-s45)]",
        borderRadius: "[8px]",

        "& > *": {
          padding: "[16px]",
          borderBottom: "[1px solid var(--colors-neutral-s45)]",
          width: "[100%]",
        },

        "& > *:last-child": {
          borderBottom: "none",
        },
      },
    },
  },
  defaultVariants: {
    layout: "block",
  },
});
