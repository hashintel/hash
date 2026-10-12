/**
 * Whether {@link MultiItemSuffix} would render anything for the given item.
 * Callers gate the suffix slot on this: the element itself is truthy even
 * when it renders nothing, which would otherwise mount the slot (and its
 * spacing) on every multi item.
 */
export const hasMultiItemSuffix = ({
  suffix,
  showOnlyButton,
  disabled,
}: {
  suffix?: React.ReactNode;
  showOnlyButton?: boolean;
  disabled?: boolean;
}): boolean => suffix != null || (!!showOnlyButton && !disabled);
