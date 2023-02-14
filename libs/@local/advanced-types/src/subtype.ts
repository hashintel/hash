/**
 * A somewhat satisfactory SubType helper type. This provides _some_ level of type safety when trying to mark one
 * type as constraining another type.
 */
export type Subtype<Type extends unknown, Sub extends Type> = Sub;
