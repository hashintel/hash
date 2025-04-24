use core::ops::ControlFlow;

use bitvec::bitvec;
use pretty::RcDoc;
use smallvec::SmallVec;

use super::TypeKind;
use crate::{
    span::SpanId,
    r#type::{
        Type, TypeId,
        collection::TypeIdSet,
        environment::{AnalysisEnvironment, Environment, LatticeEnvironment, SimplifyEnvironment},
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
        let mut variants = TypeIdSet::with_capacity(env, self.variants.len());

        for &variant in self.variants {
            if let TypeKind::Union(union) = env.types[variant].copied().kind {
                variants.extend(union.unnest(env));
            } else {
                variants.push(variant);
            }
        }

        variants.finish()
    }

    pub(crate) fn join_variants(
        lhs_variants: &[TypeId],
        rhs_variants: &[TypeId],
        env: &Environment,
    ) -> SmallVec<TypeId, 4> {
        if lhs_variants.is_empty() {
            return SmallVec::from_slice(rhs_variants);
        }

        if rhs_variants.is_empty() {
            return SmallVec::from_slice(lhs_variants);
        }

        let mut variants = TypeIdSet::with_capacity(env, lhs_variants.len() + rhs_variants.len());
        variants.extend_from_slice(lhs_variants);
        variants.extend_from_slice(rhs_variants);

        variants.finish()
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
        let mut variants = TypeIdSet::<16>::with_capacity(
            env.environment,
            lhs_variants.len() * rhs_variants.len(),
        );

        for &lhs in lhs_variants {
            for &rhs in rhs_variants {
                variants.push(env.meet(lhs, rhs));
            }
        }

        let variants = variants.finish();

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
        env: &mut AnalysisEnvironment<'_, 'heap>,
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
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool
    where
        T: PrettyPrint,
        U: PrettyPrint,
    {
        // Empty unions are only equivalent to other empty unions
        // As an empty union corresponds to the `Never` type, therefore only `Never ≡ Never`
        if lhs_variants.is_empty() && rhs_variants.is_empty() {
            return true;
        }

        // Special case for empty unions (Never type)
        if lhs_variants.is_empty() || rhs_variants.is_empty() {
            // We always fail-fast here
            let _: ControlFlow<()> = env.record_diagnostic(|env| {
                let help = "The Never type (empty union) can only be equivalent to itself. A \
                            non-empty union cannot be equivalent to Never.";

                type_mismatch(env, lhs, rhs, Some(help))
            });

            return false;
        }

        let mut lhs_compatible = true;
        let mut rhs_compatible = true;

        let mut lhs_matched = bitvec![0; lhs_variants.len()];
        let mut rhs_matched = bitvec![0; rhs_variants.len()];

        // Find all matching pairs
        for (&lhs_variant, mut lhs_matched) in lhs_variants.iter().zip(lhs_matched.iter_mut()) {
            for (&rhs_variant, rhs_matched) in rhs_variants.iter().zip(rhs_matched.iter_mut()) {
                if env.is_equivalent(lhs_variant, rhs_variant) {
                    *lhs_matched = true;
                    rhs_matched.commit(true);
                }
            }
        }

        // Check if there are any lhs variants which weren't matched
        for index in lhs_matched.iter_zeros() {
            let lhs_variant = lhs_variants[index];

            if env
                .record_diagnostic(|env| {
                    union_variant_mismatch(env, env.types[lhs_variant].copied(), rhs)
                })
                .is_break()
            {
                return false;
            }

            lhs_compatible = false;
        }

        // Check if there are any rhs variants which weren't matched
        for index in rhs_matched.iter_zeros() {
            let rhs_variant = rhs_variants[index];

            if env
                .record_diagnostic(|env| {
                    union_variant_mismatch(env, env.types[rhs_variant].copied(), lhs)
                })
                .is_break()
            {
                return false;
            }

            rhs_compatible = false;
        }

        lhs_compatible && rhs_compatible
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

        Self::join_variants(&lhs_variants, &rhs_variants, env)
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

    fn is_bottom(self: Type<'heap, Self>, _: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.variants.is_empty()
    }

    fn is_top(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.variants.iter().any(|&id| env.is_top(id))
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.variants.iter().all(|&id| env.is_concrete(id))
    }

    fn distribute_union(
        self: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        self.kind
            .variants
            .iter()
            .flat_map(|&variant| env.distribute_union(variant))
            .collect()
    }

    fn distribute_intersection(
        self: Type<'heap, Self>,
        _: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        SmallVec::from_slice(&[self.id])
    }

    /// Checks if this union type is a subtype of the given supertype.
    ///
    /// In type theory, a union type `A | B` represents a type that has *either* the properties
    /// of `A` or `B`. A value of this type must satisfy the constraints of at least one of the
    /// component types.
    ///
    /// Unions decompose in the following way:
    /// ```text
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
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        let self_variants = self.distribute_union(env);
        let super_variants = supertype.distribute_union(env);

        Self::is_subtype_of_variants(self, supertype, &self_variants, &super_variants, env)
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        let lhs_variants = self.distribute_union(env);
        let rhs_variants = other.distribute_union(env);

        Self::is_equivalent_variants(self, other, &lhs_variants, &rhs_variants, env)
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        // Gather + flatten + simplify
        let mut variants =
            TypeIdSet::<16>::with_capacity(env.environment, self.kind.variants.len());
        for &variant in self.kind.variants {
            let variant = env.simplify(variant);

            if let Some(UnionType { variants: nested }) = env.types[variant].copied().kind.union() {
                variants.extend_from_slice(nested);
            } else {
                variants.push(variant);
            }
        }

        // Sort, dedupe, drop bottom
        let mut variants = variants.finish();
        variants.retain(|&mut variant| !env.is_bottom(variant));

        // Propagate top type
        if variants.iter().any(|&variant| env.is_top(variant)) {
            return env.alloc(|id| Type {
                id,
                span: self.span,
                kind: env.intern_kind(TypeKind::Unknown),
            });
        }

        // TODO: in the future we might want to consider collapse via constructor-merge, turning
        // any: `List<T> | List<U>` into `List<T | U>`.

        // Collapse via subsumption
        let backup = variants.clone();
        variants.retain(|&mut subtype| {
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
        RcDoc::text("(")
            .append(
                RcDoc::intersperse(
                    self.variants
                        .iter()
                        .map(|&variant| limit.pretty(env, variant)),
                    RcDoc::line()
                        .append(RcDoc::text("|"))
                        .append(RcDoc::space()),
                )
                .nest(1)
                .group(),
            )
            .append(RcDoc::text(")"))
    }
}

#[cfg(test)]
mod test {
    #![expect(clippy::min_ident_chars)]

    // Tests for the fixed union equivalence functionality with different variant counts
    use core::assert_matches::assert_matches;

    use super::UnionType;
    use crate::{
        heap::Heap,
        span::SpanId,
        r#type::{
            environment::{
                AnalysisEnvironment, Environment, LatticeEnvironment, SimplifyEnvironment,
            },
            kind::{
                TypeKind,
                intersection::IntersectionType,
                intrinsic::{DictType, IntrinsicType},
                primitive::PrimitiveType,
                test::{assert_equiv, dict, intersection, primitive, tuple, union},
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
            [
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Number),
            ]
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
                primitive!(env, PrimitiveType::Null),
                primitive!(env, PrimitiveType::Boolean),
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Number),
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
                primitive!(env, PrimitiveType::String),
            ]
        );

        let mut lattice_env = LatticeEnvironment::new(&env);

        // Empty union joined with any union should be the other union
        assert_equiv!(
            env,
            empty.join(non_empty, &mut lattice_env),
            [
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Number),
            ]
        );

        // The reverse should also be true
        assert_equiv!(
            env,
            non_empty.join(empty, &mut lattice_env),
            [
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Number),
            ]
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

        // Join without simplification should lead to a union with all variants
        assert_equiv!(
            env,
            a.join(b, &mut lattice_env),
            [
                primitive!(env, PrimitiveType::Boolean),
                primitive!(env, PrimitiveType::String),
                primitive!(env, PrimitiveType::Number),
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
                    primitive!(env, PrimitiveType::String),
                    instantiate(&env, TypeKind::Never),
                    instantiate(&env, TypeKind::Never)
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
            [union!(
                env,
                [
                    integer,
                    string,
                    instantiate(&env, TypeKind::Never),
                    instantiate(&env, TypeKind::Never)
                ]
            )]
        );
    }

    #[test]
    fn is_bottom() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Empty union (Never)
        union!(env, empty, []);

        // Non-empty union
        union!(env, non_empty, [primitive!(env, PrimitiveType::Number)]);

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Empty union should be bottom (uninhabited)
        assert!(empty.is_bottom(&mut analysis_env));

        // Non-empty union should not be bottom
        assert!(!non_empty.is_bottom(&mut analysis_env));
    }

    #[test]
    fn is_top() {
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

        let mut analysis_env = AnalysisEnvironment::new(&env);

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

        let mut analysis_env = AnalysisEnvironment::new(&env);

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

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Empty union should be a subtype of any other union
        assert!(empty.is_subtype_of(non_empty, &mut analysis_env));
    }

    #[test]
    fn covariant_union_is_subtype() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Dict<String, Number>
        dict!(
            env,
            dict_string_number,
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Number)
        );

        // Dict<String, Number | String>
        dict!(
            env,
            dict_string_number_string,
            primitive!(env, PrimitiveType::String),
            union!(
                env,
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::String)
                ]
            )
        );

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Dict<String, Number> <: Dict<String, Number | String>
        assert!(dict_string_number.is_subtype_of(dict_string_number_string, &mut analysis_env));
    }

    #[test]
    fn covariant_union_equivalence() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Dict<String, Number> | Dict<String, String>
        let union_dict_string_number_string = union!(
            env,
            [
                dict!(
                    env,
                    primitive!(env, PrimitiveType::String),
                    primitive!(env, PrimitiveType::Number)
                ),
                dict!(
                    env,
                    primitive!(env, PrimitiveType::String),
                    primitive!(env, PrimitiveType::String)
                )
            ]
        );

        // Dict<String, Number | String>
        let dict_string_number_string = dict!(
            env,
            primitive!(env, PrimitiveType::String),
            union!(
                env,
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::String)
                ]
            )
        );

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Dict<String, Number> | Dict<String, Number> = Dict<String, Number | String>
        assert!(
            analysis_env.is_equivalent(union_dict_string_number_string, dict_string_number_string)
        );
        assert!(
            analysis_env.is_equivalent(dict_string_number_string, union_dict_string_number_string)
        );
    }

    #[test]
    fn union_equivalence_with_different_variant_counts() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Dict<String, Boolean>
        let dict_string_boolean = dict!(
            env,
            primitive!(env, PrimitiveType::String),
            primitive!(env, PrimitiveType::Boolean)
        );

        // Dict<Number, Boolean>
        let dict_number_boolean = dict!(
            env,
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::Boolean)
        );

        // Dict<Number, String>
        let dict_number_string = dict!(
            env,
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String)
        );

        // Dict<Number, Boolean | String>
        let dict_number_boolean_string = dict!(
            env,
            primitive!(env, PrimitiveType::Number),
            union!(
                env,
                [
                    primitive!(env, PrimitiveType::Boolean),
                    primitive!(env, PrimitiveType::String)
                ]
            )
        );

        // Create the two union types we want to compare:
        // Type 1: Dict<String, Boolean> | Dict<Number, Boolean | String>
        union!(
            env,
            type1,
            [dict_string_boolean, dict_number_boolean_string]
        );

        // Type 2: Dict<String, Boolean> | Dict<Number, Boolean> | Dict<Number, String>
        union!(
            env,
            type2,
            [dict_string_boolean, dict_number_boolean, dict_number_string]
        );

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // These types should be equivalent despite having different variant counts
        assert!(type1.is_equivalent(type2, &mut analysis_env));
        assert!(type2.is_equivalent(type1, &mut analysis_env));
    }

    #[test]
    fn union_equivalence_non_equivalent_different_counts() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create some basic types
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        let boolean = primitive!(env, PrimitiveType::Boolean);
        let null = primitive!(env, PrimitiveType::Null);

        // Create a union with 2 variants
        union!(env, type1, [number, string]);

        // Create a union with 3 variants, adding a type not covered by type1
        union!(env, type2, [number, string, boolean]);

        // Create another union with 3 variants but equivalent to type1 + a null type
        union!(env, type3, [number, string, null]);

        let mut analysis_env = AnalysisEnvironment::new(&env);

        // These should not be equivalent (boolean is not covered by type1)
        assert!(!type1.is_equivalent(type2, &mut analysis_env));
        assert!(!type2.is_equivalent(type1, &mut analysis_env));

        // These should also not be equivalent (null is not covered by type1)
        assert!(!type1.is_equivalent(type3, &mut analysis_env));
        assert!(!type3.is_equivalent(type1, &mut analysis_env));
    }

    #[test]
    fn no_union_is_subtype_of_never() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Empty union (Never)
        union!(env, empty, []);

        // Non-empty union
        union!(env, non_empty, [primitive!(env, PrimitiveType::Number)]);

        let mut analysis_env = AnalysisEnvironment::new(&env);

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

        let mut analysis_env = AnalysisEnvironment::new(&env);

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
    fn is_equivalent() {
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

        let mut analysis_env = AnalysisEnvironment::new(&env);

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

        let mut analysis_env = AnalysisEnvironment::new(&env);

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
        union!(
            env,
            union_type,
            [
                primitive!(env, PrimitiveType::Number),
                primitive!(env, PrimitiveType::Number)
            ]
        );

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying should collapse duplicates
        let result = union_type.simplify(&mut simplify_env);
        let result_type = env.types[result].copied();

        println!("{}", result_type.pretty_print(&env, 80));

        // Result should be just Number, not a union
        assert_matches!(
            *result_type.kind,
            TypeKind::Primitive(PrimitiveType::Number)
        );
    }

    #[test]
    fn simplify_nested_unions() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create nested unions
        let nested = union!(env, [primitive!(env, PrimitiveType::Number)]);
        union!(
            env,
            union_type,
            [nested, primitive!(env, PrimitiveType::String)]
        );

        let mut simplify_env = SimplifyEnvironment::new(&env);

        // Simplifying should flatten nested unions
        assert_equiv!(
            env,
            [union_type.simplify(&mut simplify_env)],
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
    fn simplify_with_bottom() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Create a union with a never type
        union!(
            env,
            union_type,
            [
                instantiate(&env, TypeKind::Never),
                primitive!(env, PrimitiveType::Number)
            ]
        );

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
        union!(
            env,
            union_type,
            [
                instantiate(&env, TypeKind::Unknown),
                primitive!(env, PrimitiveType::Number)
            ]
        );

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
    fn is_concrete() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
        let mut analysis_env = AnalysisEnvironment::new(&env);

        // Concrete union (with all concrete variants)
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        union!(env, concrete_union, [number, string]);
        assert!(concrete_union.is_concrete(&mut analysis_env));

        // Non-concrete union (with at least one non-concrete variant)
        let infer_var = instantiate(&env, TypeKind::Infer);
        union!(env, non_concrete_union, [number, infer_var]);
        assert!(!non_concrete_union.is_concrete(&mut analysis_env));

        // Empty union should be concrete
        union!(env, empty_union, []);
        assert!(empty_union.is_concrete(&mut analysis_env));

        // Nested non-concrete union
        union!(
            env,
            nested_union,
            [concrete_union.id, non_concrete_union.id]
        );
        assert!(!nested_union.is_concrete(&mut analysis_env));
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

        let mut analysis_env = AnalysisEnvironment::new(&env);

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

        let mut analysis_env = AnalysisEnvironment::new(&env);

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
