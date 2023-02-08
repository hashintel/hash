type BrandedBase<Base, Kind extends {}> = Base & {
  // The property prefixes are chosen such that they shouldn't appear in intellisense.

  /** The type of the value space that is branded */
  readonly "#base": Base;
  /** The unique name for the branded type */
  readonly "#kind": Kind;
};

/**
 * The type-branding type to support nominal (name based) types
 */
export type Brand<Base, Kind extends string> = Base extends BrandedBase<
  infer NestedBase,
  infer NestedKind
>
  ? BrandedBase<NestedBase, NestedKind & { [_ in Kind]: true }>
  : BrandedBase<Base, { [_ in Kind]: true }>;
