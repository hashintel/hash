use core::ops::ControlFlow;
use std::env::vars;

use pretty::RcDoc;
use smallvec::SmallVec;

use super::TypeKind;
use crate::{
    span::SpanId,
    r#type::{
        Type, TypeId,
        environment::{
            Environment, LatticeEnvironment, SimplifyEnvironment, TypeAnalysisEnvironment,
        },
        error::{cannot_be_subtype_of_never, type_mismatch, union_variant_mismatch},
        lattice::Lattice,
        pretty_print::PrettyPrint,
        recursion::RecursionDepthBoundary,
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct UnionType<'heap> {
    pub variants: &'heap [TypeId],
}

impl<'heap> UnionType<'heap> {
    pub(crate) fn unnest(&self, env: &Environment) -> SmallVec<TypeId, 16> {
        let mut variants = SmallVec::with_capacity(self.variants.len());

        for &variant in self.variants {
            if let TypeKind::Union(union) = env.types[variant].copied().kind {
                variants.extend(union.unnest(env));
            } else {
                variants.push(variant);
            }
        }

        variants.sort_unstable();
        variants.dedup();

        variants
    }

    pub(crate) fn join_variants(
        lhs_variants: &[TypeId],
        rhs_variants: &[TypeId],
    ) -> SmallVec<TypeId, 4> {
        if lhs_variants.is_empty() {
            return SmallVec::from_slice(rhs_variants);
        }

        if rhs_variants.is_empty() {
            return SmallVec::from_slice(lhs_variants);
        }

        let mut variants = SmallVec::with_capacity(lhs_variants.len() + rhs_variants.len());
        variants.extend_from_slice(lhs_variants);
        variants.extend_from_slice(rhs_variants);

        // Order by the id, as a union is a set and therefore is irrespective of order
        variants.sort_unstable();
        variants.dedup();

        variants
    }

    pub(crate) fn meet_variants(
        lhs_span: SpanId,
        lhs_variants: &[TypeId],
        rhs_variants: &[TypeId],
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        // `meet` over a union is a distribution, e.g.
        // (A ∪ B) ∧ (C ∪ D)
        // = (A ∧ C) ∪ (A ∧ D) ∪ (B ∧ C) ∪ (B ∧ D)
        let mut variants =
            SmallVec::<_, 16>::with_capacity(lhs_variants.len() * rhs_variants.len());

        for &lhs in lhs_variants {
            for &rhs in rhs_variants {
                variants.push(env.meet(lhs, rhs));
            }
        }

        variants.sort_unstable();
        variants.dedup();

        // We need to wrap this in an explicit `Union`, as a `meet` with multiple returned values
        // turns into an intersection.
        let id = env.alloc(|id| Type {
            id,
            span: lhs_span,
            kind: env.intern_kind(TypeKind::Union(UnionType {
                variants: env.intern_type_ids(&variants),
            })),
        });

        SmallVec::from_slice(&[id])
    }

    pub(crate) fn is_subtype_of_variants<T, U>(
        actual: Type<'heap, T>,
        expected: Type<'heap, U>,
        self_variants: &[TypeId],
        super_variants: &[TypeId],
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool
    where
        T: PrettyPrint,
        U: PrettyPrint,
    {
        // Empty union (corresponds to the Never type) is a subtype of any union type
        if self_variants.is_empty() {
            return true;
        }

        // If the supertype is empty, only an empty subtype can be a subtype of it
        if super_variants.is_empty() {
            // We always fail-fast here
            let _: ControlFlow<()> =
                env.record_diagnostic(|env| cannot_be_subtype_of_never(env, actual));

            return false;
        }

        let mut compatible = true;

        for &self_variant in self_variants {
            let found = super_variants.iter().any(|&super_variant| {
                env.in_covariant(|env| env.is_subtype_of(self_variant, super_variant))
            });

            if found {
                continue;
            }

            if env
                .record_diagnostic(|env| {
                    union_variant_mismatch(env, env.types[self_variant].copied(), expected)
                })
                .is_break()
            {
                return false;
            }

            compatible = false;
        }

        compatible
    }

    pub(crate) fn is_equivalent_variants<T, U>(
        lhs: Type<'heap, T>,
        rhs: Type<'heap, U>,
        lhs_variants: &[TypeId],
        rhs_variants: &[TypeId],
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool
    where
        T: PrettyPrint,
        U: PrettyPrint,
    {
        if lhs_variants.len() != rhs_variants.len() {
            // We always fail-fast here
            let _: ControlFlow<()> = env.record_diagnostic(|env| {
                let help = if lhs_variants.is_empty() || rhs_variants.is_empty() {
                    "The Never type (empty union) can only be equivalent to itself. A non-empty \
                     union cannot be equivalent to Never."
                } else {
                    "Union types must have the same number of variants to be equivalent."
                };

                type_mismatch(env, lhs, rhs, Some(help))
            });

            return false;
        }

        let mut equivalent = true;

        // For every variant x in lhs_variants, there exists a y in rhs_variants where x ≡ y
        for &lhs_variant in lhs_variants {
            let found = rhs_variants
                .iter()
                .any(|&rhs_variant| env.is_equivalent(lhs_variant, rhs_variant));

            if found {
                continue;
            }

            if env
                .record_diagnostic(|env| {
                    union_variant_mismatch(env, env.types[lhs_variant].copied(), rhs)
                })
                .is_break()
            {
                return false;
            }

            equivalent = false;
        }

        equivalent
    }
}

impl<'heap> Lattice<'heap> for UnionType<'heap> {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        let lhs_variants = self.kind.unnest(env);
        let rhs_variants = other.kind.unnest(env);

        Self::join_variants(&lhs_variants, &rhs_variants)
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        let lhs_variants = self.kind.unnest(env);
        let rhs_variants = other.kind.unnest(env);

        Self::meet_variants(self.span, &lhs_variants, &rhs_variants, env)
    }

    fn is_bottom(self: Type<'heap, Self>, _: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.variants.is_empty()
    }

    fn is_top(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.variants.iter().any(|&id| env.is_top(id))
    }

    /// Checks if this union type is a subtype of the given supertype.
    ///
    /// In type theory, a union type `A | B` represents a type that has *either* the properties
    /// of `A` or `B`. A value of this type must satisfy the constraints of at least one of the
    /// component types.
    ///
    /// Unions decompose in the following way:
    /// ```ignore
    /// (A | B) <: (C | D)
    ///   <=> A <: (C | D) ∧ B <: (C | D)
    ///   <=> (A <: C ∨ A <: D) ∧ (B <: C ∨ B <: D)
    /// ```
    ///
    /// This means that for each variant in the subtype union, there must exist at least one
    /// variant in the supertype union that is a supertype of it.
    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        let self_variants = self.kind.unnest(env);
        let super_variants = supertype.kind.unnest(env);

        Self::is_subtype_of_variants(self, supertype, &self_variants, &super_variants, env)
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        let lhs_variants = self.kind.unnest(env);
        let rhs_variants = other.kind.unnest(env);

        Self::is_equivalent_variants(self, other, &lhs_variants, &rhs_variants, env)
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        // Gather + flatten + simplify
        let mut variants = Vec::with_capacity(self.kind.variants.len());
        for &variant in self.kind.variants {
            let variant = env.simplify(variant);

            if let Some(UnionType { variants: nested }) = env.types[variant].copied().kind.union() {
                variants.extend_from_slice(nested);
            } else {
                variants.push(variant);
            }
        }

        // Sort, dedupe, drop bottom
        variants.sort_unstable();
        variants.dedup();
        variants.retain(|&variant| !env.is_bottom(variant));

        // Propagate top type
        if variants.iter().any(|&variant| env.is_top(variant)) {
            return env.alloc(|id| Type {
                id,
                span: self.span,
                kind: env.intern_kind(TypeKind::Unknown),
            });
        }

        // TODO: Test - what happens on `Number | Integer`, what happens on `Number | Number`
        // Drop subtypes of other variants
        let backup = variants.clone();
        variants.retain(|&subtype| {
            // keep v only if it is *not* a subtype of any other distinct u
            !backup
                .iter()
                .any(|&supertype| subtype != supertype && env.is_subtype_of(subtype, supertype))
        });

        // Collapse empty or singleton
        match variants.len() {
            0 => env.alloc(|id| Type {
                id,
                span: self.span,
                kind: env.intern_kind(TypeKind::Never),
            }),
            1 => variants[0],
            _ if variants.as_slice() == self.kind.variants => self.id,
            _ => env.alloc(|id| Type {
                id,
                span: self.span,
                kind: env.intern_kind(TypeKind::Union(UnionType {
                    variants: env.intern_type_ids(&variants),
                })),
            }),
        }
    }
}

impl PrettyPrint for UnionType<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> pretty::RcDoc<'env, anstyle::Style> {
        RcDoc::intersperse(
            self.variants
                .iter()
                .map(|&variant| limit.pretty(env, variant)),
            RcDoc::line()
                .append(RcDoc::text("|"))
                .append(RcDoc::space()),
        )
        .nest(1)
        .group()
    }
}

#[cfg(test)]
mod test {
    #![expect(clippy::min_ident_chars)]
    use super::UnionType;
    use crate::{
        heap::Heap,
        span::SpanId,
        r#type::{
            environment::{
                Environment, LatticeEnvironment, SimplifyEnvironment, TypeAnalysisEnvironment,
            },
            kind::{
                TypeKind,
                generic_argument::GenericArguments,
                intersection::IntersectionType,
                primitive::PrimitiveType,
                test::{assert_equiv, intersection, primitive, tuple, union},
                tuple::TupleType,
            },
            lattice::{Lattice as _, test::assert_lattice_laws},
            pretty_print::PrettyPrint as _,
            test::instantiate,
        },
    };

    #[test]
    fn unnest_flattens_nested_unions() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a union type with a nested union
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        let boolean = primitive!(env, PrimitiveType::Boolean);

        // Create a nested union: (String | Boolean)
        let nested_union = union!(env, [string, boolean]);

        // Create a union that includes the nested union: Number | (String | Boolean)
        union!(env, union_type, [number, nested_union]);

        // Unnesting should flatten to: Number | String | Boolean
        let unnested = union_type.kind.unnest(&env);

        assert_eq!(unnested.len(), 3);
        assert!(unnested.contains(&number));
        assert!(unnested.contains(&string));
        assert!(unnested.contains(&boolean));
    }

    #[test]
    fn join_identical_unions() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        union!(
            env,
            a,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );
        union!(
            env,
            b,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Join identical unions should result in the same union
        assert_equiv!(
            env,
            a.join(b, &mut lattice_env),
            [union!(
                env,
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::String)
                ]
            )]
        );
    }

    #[test]
    fn join_different_unions() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create different union types
        union!(
            env,
            a,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );
        union!(
            env,
            b,
            [
                primitive!(env, PrimitiveType::Boolean),
                primitive!(env, PrimitiveType::Null)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Join different unions should include all variants
        assert_equiv!(
            env,
            a.join(b, &mut lattice_env),
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Boolean),
                primitive!(env, PrimitiveType::Null)
            ]
        );
    }

    #[test]
    fn join_with_empty_union() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an empty union (Never) and a non-empty union
        union!(env, empty, []);
        union!(
            env,
            non_empty,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Empty union joined with any union should be the other union
        assert_equiv!(
            env,
            empty.join(non_empty, &mut lattice_env),
            [union!(
                env,
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::String)
                ]
            )]
        );

        // The reverse should also be true
        assert_equiv!(
            env,
            non_empty.join(empty, &mut lattice_env),
            [union!(
                env,
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::String)
                ]
            )]
        );
    }

    #[test]
    fn join_with_overlapping_unions() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create overlapping unions
        union!(
            env,
            a,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );
        union!(
            env,
            b,
            [
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Boolean)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Join should deduplicate the common variant
        assert_equiv!(
            env,
            a.join(b, &mut lattice_env),
            [
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::Boolean)
            ]
        );
    }

    #[test]
    fn meet_disjoint_unions() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create disjoint unions (no common variants)
        union!(
            env,
            a,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );
        union!(
            env,
            b,
            [
                primitive!(env, PrimitiveType::Boolean),
                primitive!(env, PrimitiveType::Null)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&env);
        lattice_env.without_simplify();

        // Should have 4 combinations: Number & Boolean, Number & Null, String & Boolean, String &
        // Null These will be represented as intersection types in the result
        // Meet should result in pairwise combinations
        assert_equiv!(
            env,
            a.meet(b, &mut lattice_env),
            [union!(
                env,
                [
                    intersection!(
                        env,
                        [
                            primitive!(env, PrimitiveType::Number),
                            primitive!(env, PrimitiveType::Boolean)
                        ]
                    ),
                    intersection!(
                        env,
                        [
                            primitive!(env, PrimitiveType::Number),
                            primitive!(env, PrimitiveType::Null)
                        ]
                    ),
                    intersection!(
                        env,
                        [
                            primitive!(env, PrimitiveType::String),
                            primitive!(env, PrimitiveType::Boolean)
                        ]
                    ),
                    intersection!(
                        env,
                        [
                            primitive!(env, PrimitiveType::String),
                            primitive!(env, PrimitiveType::Null)
                        ]
                    )
                ]
            )]
        );
    }

    #[test]
    fn meet_identical_unions() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        union!(
            env,
            a,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );
        union!(
            env,
            b,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Meet identical unions should result in the same union
        assert_equiv!(
            env,
            a.meet(b, &mut lattice_env),
            [union!(
                env,
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::String)
                ]
            )]
        );
    }

    #[test]
    fn meet_with_empty_union() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an empty union (Never) and a non-empty union
        union!(env, empty, []);
        union!(
            env,
            non_empty,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Empty union met with any union should be empty
        assert_equiv!(
            env,
            empty.meet(non_empty, &mut lattice_env),
            [union!(env, [])]
        );

        // The reverse should also be true
        assert_equiv!(
            env,
            non_empty.meet(empty, &mut lattice_env),
            [union!(env, [])]
        );
    }

    #[test]
    fn meet_subtype_supertype() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a union with Number and another with Integer (where Integer <: Number)
        let number = primitive!(env, PrimitiveType::Number);
        let integer = primitive!(env, PrimitiveType::Integer);
        let string = primitive!(env, PrimitiveType::String);

        union!(env, number_union, [number, string]);
        union!(env, integer_union, [integer, string]);

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Meet should retain the subtype in the result
        assert_equiv!(
            env,
            number_union.meet(integer_union, &mut lattice_env),
            [union!(env, [integer, string])]
        );
    }

    #[test]
    fn is_bottom_test() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Empty union (Never)
        union!(env, empty, []);

        // Non-empty union
        union!(env, non_empty, [primitive!(env, PrimitiveType::Number)]);

        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // Empty union should be bottom (uninhabited)
        assert!(empty.is_bottom(&mut analysis_env));

        // Non-empty union should not be bottom
        assert!(!non_empty.is_bottom(&mut analysis_env));
    }

    #[test]
    fn is_top_test() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Regular union
        union!(
            env,
            regular,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        // Union containing top type (Unknown)
        let unknown = instantiate(&env, TypeKind::Unknown);
        union!(
            env,
            with_top,
            [unknown, primitive!(env, PrimitiveType::String)]
        );

        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // Regular union should not be top
        assert!(!regular.is_top(&mut analysis_env));

        // Union with Unknown should be considered top
        assert!(with_top.is_top(&mut analysis_env));
    }

    #[test]
    fn is_subtype_of_self() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a union type
        union!(
            env,
            union_type,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // A union should be a subtype of itself (reflexivity)
        assert!(union_type.is_subtype_of(union_type, &mut analysis_env));
    }

    #[test]
    fn empty_union_is_subtype_of_all() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Empty union (Never)
        union!(env, empty, []);

        // Non-empty union
        union!(env, non_empty, [primitive!(env, PrimitiveType::Number)]);

        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // Empty union should be a subtype of any other union
        assert!(empty.is_subtype_of(non_empty, &mut analysis_env));
    }

    #[test]
    fn no_union_is_subtype_of_never() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Empty union (Never)
        union!(env, empty, []);

        // Non-empty union
        union!(env, non_empty, [primitive!(env, PrimitiveType::Number)]);

        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // Non-empty union should not be a subtype of empty union
        assert!(!non_empty.is_subtype_of(empty, &mut analysis_env));
    }

    #[test]
    fn subtype_supertype_relation() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a union with Number and String
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        union!(env, number_string, [number, string]);

        // Create a union with Integer (subtype of Number) and String
        let integer = primitive!(env, PrimitiveType::Integer);
        union!(env, integer_string, [integer, string]);

        // Create a union with just Number
        union!(env, just_number, [number]);

        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // Integer | String should be a subtype of Number | String
        assert!(integer_string.is_subtype_of(number_string, &mut analysis_env));

        // Number | String should not be a subtype of Integer | String
        assert!(!number_string.is_subtype_of(integer_string, &mut analysis_env));

        // Number should be a subtype of Number | String
        assert!(just_number.is_subtype_of(number_string, &mut analysis_env));

        // Number | String should not be a subtype of Number
        assert!(!number_string.is_subtype_of(just_number, &mut analysis_env));
    }

    #[test]
    fn is_equivalent_test() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create identical unions (but at different type IDs)
        union!(
            env,
            a,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );
        union!(
            env,
            b,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::String)
            ]
        );

        // Create a union with same types in different order
        union!(
            env,
            c,
            [
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Number)
            ]
        );

        // Create a union with different types
        union!(
            env,
            d,
            [
                primitive!(env, PrimitiveType::Boolean),
                primitive!(env, PrimitiveType::Number)
            ]
        );

        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // Same unions should be equivalent
        assert!(a.is_equivalent(b, &mut analysis_env));

        // Order shouldn't matter for equivalence
        assert!(a.is_equivalent(c, &mut analysis_env));

        // Different unions should not be equivalent
        assert!(!a.is_equivalent(d, &mut analysis_env));
    }

    #[test]
    fn empty_union_equivalence() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create two empty unions
        union!(env, a, []);
        union!(env, b, []);

        // Create a non-empty union
        union!(env, c, [primitive!(env, PrimitiveType::Number)]);

        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // Empty unions should be equivalent to each other
        assert!(a.is_equivalent(b, &mut analysis_env));

        // Empty union should not be equivalent to non-empty union
        assert!(!a.is_equivalent(c, &mut analysis_env));
    }

    #[test]
    fn simplify_identical_variants() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a union with duplicate variants
        let number = primitive!(env, PrimitiveType::Number);
        union!(env, union_type, [number, number]);

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying should collapse duplicates
        let result = union_type.simplify(&mut simplify_env);
        let result_type = env.types[result].copied();

        // Result should be just Number, not a union
        assert!(matches!(
            *result_type.kind,
            TypeKind::Primitive(PrimitiveType::Number)
        ));
    }

    #[test]
    fn simplify_nested_unions() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create nested unions
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        let nested = union!(env, [number]);
        union!(env, union_type, [nested, string]);

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying should flatten nested unions
        assert_equiv!(
            env,
            [union_type.simplify(&mut simplify_env)],
            [union!(env, [number, string])]
        );
    }

    #[test]
    fn simplify_with_bottom() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a union with a never type
        let never = instantiate(&env, TypeKind::Never);
        let number = primitive!(env, PrimitiveType::Number);
        union!(env, union_type, [never, number]);

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying should remove the Never type
        let result = union_type.simplify(&mut simplify_env);
        let result_type = env.types[result].copied();

        // Result should be just Number, not a union
        assert!(matches!(
            *result_type.kind,
            TypeKind::Primitive(PrimitiveType::Number)
        ));
    }

    #[test]
    fn simplify_with_top() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a union with a top (Unknown) type
        let unknown = instantiate(&env, TypeKind::Unknown);
        let number = primitive!(env, PrimitiveType::Number);
        union!(env, union_type, [unknown, number]);

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying should collapse to the top type
        let result = union_type.simplify(&mut simplify_env);
        let result_type = env.types[result].copied();

        // Result should be Unknown
        assert!(matches!(*result_type.kind, TypeKind::Unknown));
    }

    #[test]
    fn simplify_empty_union() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create an empty union
        union!(env, union_type, []);

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying empty union should result in Never
        let result = union_type.simplify(&mut simplify_env);
        let result_type = env.types[result].copied();

        assert!(matches!(*result_type.kind, TypeKind::Never));
    }

    #[test]
    fn simplify_with_subtypes() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a union with a type and its subtype
        let number = primitive!(env, PrimitiveType::Number);
        let integer = primitive!(env, PrimitiveType::Integer); // Integer is a subtype of Number
        union!(env, union_type, [number, integer]);

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying should remove the subtype
        let result = union_type.simplify(&mut simplify_env);
        let result_type = env.types[result].copied();

        // Result should be just Number
        assert!(matches!(
            *result_type.kind,
            TypeKind::Primitive(PrimitiveType::Number)
        ));
    }

    #[test]
    fn lattice_laws() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create three distinct union types for testing lattice laws
        let a = union!(env, [primitive!(env, PrimitiveType::Number)]);
        let b = union!(env, [primitive!(env, PrimitiveType::String)]);
        let c = union!(env, [primitive!(env, PrimitiveType::Boolean)]);

        // Test that union types satisfy lattice laws (associativity, commutativity, absorption)
        assert_lattice_laws(&env, a, b, c);
    }

    #[test]
    fn complex_union_relationships() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create various types to use in unions
        let number = primitive!(env, PrimitiveType::Number);
        let integer = primitive!(env, PrimitiveType::Integer);
        let string = primitive!(env, PrimitiveType::String);
        let boolean = primitive!(env, PrimitiveType::Boolean);

        // Number | String
        union!(env, number_string, [number, string]);

        // Integer | String
        union!(env, integer_string, [integer, string]);

        // Number | Boolean
        union!(env, number_boolean, [number, boolean]);

        // Number | Integer
        union!(env, number_integer, [number, integer]);

        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // Integer | String <: Number | String (because Integer <: Number)
        assert!(integer_string.is_subtype_of(number_string, &mut analysis_env));

        // Number | String ≮: Integer | String
        assert!(!number_string.is_subtype_of(integer_string, &mut analysis_env));

        // Number | Boolean ≮: Number | String
        assert!(!number_boolean.is_subtype_of(number_string, &mut analysis_env));

        // No subtype relationship between Number | Boolean and Integer | String
        assert!(!number_boolean.is_subtype_of(integer_string, &mut analysis_env));
        assert!(!integer_string.is_subtype_of(number_boolean, &mut analysis_env));

        // Number | Integer simplifies to just Number
        let mut simplify_env = SimplifyEnvironment::new(&env);
        let simplified = number_integer.simplify(&mut simplify_env);
        let simplified_type = env.types[simplified].copied();
        assert!(matches!(
            *simplified_type.kind,
            TypeKind::Primitive(PrimitiveType::Number)
        ));
    }

    #[test]
    fn union_with_tuple_types() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create tuple types
        let tuple1 = tuple!(env, [], [primitive!(env, PrimitiveType::Number)]);
        let tuple2 = tuple!(env, [], [primitive!(env, PrimitiveType::String)]);

        // Create a union of tuple types
        union!(env, union_type, [tuple1, tuple2]);

        let mut analysis_env = TypeAnalysisEnvironment::new(&env);

        // Union operations should work with non-primitive types as well
        assert!(!union_type.is_bottom(&mut analysis_env));
        assert!(!union_type.is_top(&mut analysis_env));

        // Test subtyping with tuples in unions
        let subtype_tuple = tuple!(env, [], [primitive!(env, PrimitiveType::Integer)]); // (Integer) <: (Number)
        union!(env, subtype_union, [subtype_tuple, tuple2]);

        assert!(subtype_union.is_subtype_of(union_type, &mut analysis_env));
        assert!(!union_type.is_subtype_of(subtype_union, &mut analysis_env));
    }
}
