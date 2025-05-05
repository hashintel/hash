use core::ops::Deref;

use pretty::RcDoc;

use super::{GenericArgumentId, Param};
use crate::{
    intern::Interned,
    span::SpanId,
    r#type::{
        PartialType, Type, TypeId,
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment, instantiate::InstantiateEnvironment,
        },
        inference::{Inference, PartialStructuralEdge},
        kind::TypeKind,
        lattice::Lattice,
        pretty_print::{ORANGE, PrettyPrint, RED},
        recursion::RecursionDepthBoundary,
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct GenericSubstitution {
    pub argument: GenericArgumentId,
    pub value: TypeId,
}

impl PrettyPrint for GenericSubstitution {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        let name = format!("?{}", self.argument);

        RcDoc::text(name)
            .annotate(ORANGE)
            .append(RcDoc::line())
            .append("=")
            .append(RcDoc::line())
            .append(limit.pretty(env, self.value))
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct GenericSubstitutions<'heap>(Option<Interned<'heap, [GenericSubstitution]>>);

impl<'heap> GenericSubstitutions<'heap> {
    #[must_use]
    pub const fn empty() -> Self {
        Self(None)
    }

    /// Create a new `GenericSubstitutions` from a slice of `GenericSubstitution`s.
    ///
    /// The caller must ensure that the slice is sorted by argument ID and contains no duplicates.
    ///
    /// You should probably use `Environment::intern_generic_substitutions` instead.
    #[must_use]
    pub const fn from_slice_unchecked(slice: Interned<'heap, [GenericSubstitution]>) -> Self {
        Self(Some(slice))
    }

    #[must_use]
    pub const fn as_slice(&self) -> &[GenericSubstitution] {
        match self.0 {
            Some(Interned(slice, _)) => slice,
            None => &[] as &[GenericSubstitution],
        }
    }

    #[must_use]
    pub const fn len(&self) -> usize {
        self.as_slice().len()
    }

    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.as_slice().is_empty()
    }

    #[must_use]
    pub fn merge(&self, other: &Self, env: &Environment<'heap>) -> Self {
        // We can merge without de-duplication, because every argument has a unique ID.
        // What we need to do tho, is to re-sort them, so that the invariants are maintained.
        let mut vec = Vec::with_capacity(self.len() + other.len());

        vec.extend_from_slice(self.as_slice());
        vec.extend_from_slice(other.as_slice());

        env.intern_generic_substitutions(&mut vec)
    }
}

impl AsRef<[GenericSubstitution]> for GenericSubstitutions<'_> {
    fn as_ref(&self) -> &[GenericSubstitution] {
        self.as_slice()
    }
}

impl Deref for GenericSubstitutions<'_> {
    type Target = [GenericSubstitution];

    fn deref(&self) -> &Self::Target {
        self.as_slice()
    }
}

impl PrettyPrint for GenericSubstitutions<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        match self.as_slice() {
            [] => RcDoc::nil(),
            slice => RcDoc::text("<")
                .append(
                    RcDoc::intersperse(
                        slice
                            .iter()
                            .map(|substitution| substitution.pretty(env, limit)),
                        RcDoc::text(",").append(RcDoc::line()),
                    )
                    .nest(1)
                    .group(),
                )
                .append(RcDoc::text(">")),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Apply<'heap> {
    pub base: TypeId,
    pub substitutions: GenericSubstitutions<'heap>,
}

impl<'heap> Apply<'heap> {
    fn wrap(
        span: SpanId,
        bases: smallvec::SmallVec<TypeId, 4>,
        substitutions: GenericSubstitutions<'heap>,
        env: &Environment<'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        bases
            .into_iter()
            .map(|base| {
                env.intern_type(PartialType {
                    span,
                    kind: env.intern_kind(TypeKind::Apply(Self {
                        base,
                        substitutions,
                    })),
                })
            })
            .collect()
    }

    pub fn join_base(
        self,
        other: Self,
        env: &mut LatticeEnvironment<'_, 'heap>,
        span: SpanId,
    ) -> smallvec::SmallVec<TypeId, 4> {
        // As we require to wrap the result in our own type, we call the function directly
        let self_base = env.r#type(self.base);
        let other_base = env.r#type(other.base);

        let bases = self_base.join(other_base, env);

        let substitutions = self.substitutions.merge(&other.substitutions, env);

        Self::wrap(span, bases, substitutions, env)
    }

    pub fn meet_base(
        self,
        other: Self,
        env: &mut LatticeEnvironment<'_, 'heap>,
        span: SpanId,
    ) -> smallvec::SmallVec<TypeId, 4> {
        // As we require to wrap the result in our own type, we call the function directly
        let self_base = env.r#type(self.base);
        let other_base = env.r#type(other.base);

        let bases = self_base.meet(other_base, env);

        let substitutions = self.substitutions.merge(&other.substitutions, env);

        Self::wrap(span, bases, substitutions, env)
    }
}

impl<'heap> Lattice<'heap> for Apply<'heap> {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        self.kind.join_base(*other.kind, env, self.span)
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        self.kind.meet_base(*other.kind, env, self.span)
    }

    fn is_bottom(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        env.is_bottom(self.kind.base)
    }

    fn is_top(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        env.is_top(self.kind.base)
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        env.is_concrete(self.kind.base)
    }

    fn is_recursive(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        env.is_recursive(self.kind.base)
    }

    fn distribute_union(
        self: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 16> {
        let base = env.distribute_union(self.kind.base);

        // Due to distribution rules, we know if there's a single element, it's the same as the
        // original type.
        if base.len() == 1 {
            return smallvec::SmallVec::from_slice(&[self.id]);
        }

        base.into_iter()
            .map(|base| {
                env.intern_type(PartialType {
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Apply(Apply {
                        base,
                        substitutions: self.kind.substitutions,
                    })),
                })
            })
            .collect()
    }

    fn distribute_intersection(
        self: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 16> {
        let base = env.distribute_intersection(self.kind.base);

        // Due to distribution rules, we know if there's a single element, it's the same as the
        // original type.
        if base.len() == 1 {
            return smallvec::SmallVec::from_slice(&[self.id]);
        }

        base.into_iter()
            .map(|base| {
                env.intern_type(PartialType {
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Apply(Apply {
                        base,
                        substitutions: self.kind.substitutions,
                    })),
                })
            })
            .collect()
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        env.is_subtype_of(self.kind.base, supertype.kind.base)
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        let base = env.simplify(self.kind.base);

        // If the type is concrete, then we no longer need the `Apply` wrapper
        if env.is_concrete(base) {
            return base;
        }

        env.intern_type(PartialType {
            span: self.span,
            kind: env.intern_kind(TypeKind::Apply(Apply {
                base,
                substitutions: self.kind.substitutions,
            })),
        })
    }
}

impl<'heap> Apply<'heap> {
    pub fn collect_substitution_constraints(
        self,
        span: SpanId,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        for &substitution in &*self.substitutions {
            let param = env.intern_type(PartialType {
                span,
                kind: env.intern_kind(TypeKind::Param(Param {
                    argument: substitution.argument,
                })),
            });

            env.in_invariant(|env| env.collect_constraints(param, substitution.value));
        }
    }
}

impl<'heap> Inference<'heap> for Apply<'heap> {
    fn collect_constraints(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        // We do not really care for the underlying type, we just want to collect our constraints
        self.kind.collect_substitution_constraints(self.span, env);
        supertype
            .kind
            .collect_substitution_constraints(supertype.span, env);

        env.collect_constraints(self.kind.base, supertype.kind.base);
    }

    fn collect_structural_edges(
        self: Type<'heap, Self>,
        variable: PartialStructuralEdge,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        // As the value is invariant, there are no structural edges between the value of the
        // substitution and argument
        env.collect_structural_edges(self.kind.base, variable);
    }

    fn instantiate(self: Type<'heap, Self>, env: &mut InstantiateEnvironment<'_, 'heap>) -> TypeId {
        let id = env.provision(self.id);
        let (_guard, substitutions) = env.instantiate_substitutions(self.kind.substitutions);

        // Skip the substitution map, this makes sure that we always generate a new type (if
        // required)
        let base = env.force_instantiate(self.kind.base);

        env.intern_provisioned(
            id,
            PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Apply(Self {
                    base,
                    substitutions,
                })),
            },
        )
    }
}

impl PrettyPrint for Apply<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        limit.pretty(env, self.base).append(
            RcDoc::line()
                .append(RcDoc::text("where").annotate(RED))
                .append(self.substitutions.pretty(env, limit))
                .group()
                .nest(1),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::{Apply, GenericSubstitution};
    use crate::{
        heap::Heap,
        span::SpanId,
        r#type::{
            PartialType,
            environment::{
                AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
                SimplifyEnvironment,
            },
            inference::{Constraint, PartialStructuralEdge, Variable, VariableKind},
            kind::{
                IntersectionType, PrimitiveType, StructType, TypeKind, UnionType,
                generic::{GenericArgumentId, GenericSubstitutions},
                infer::HoleId,
                r#struct::StructField,
                test::{
                    apply, assert_equiv, intersection, primitive, r#struct, struct_field, union,
                },
            },
            pretty_print::PrettyPrint as _,
            test::{instantiate, instantiate_infer},
        },
    };

    #[test]
    fn meet() {
        // Meet should wrap the result of the underlying operation
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let mut lattice = LatticeEnvironment::new(&env);

        let primitive_number = primitive!(env, PrimitiveType::Number);
        let primitive_integer = primitive!(env, PrimitiveType::Integer);

        let applied_number = apply!(env, primitive_number, []);
        let applied_integer = apply!(env, primitive_integer, []);

        assert_equiv!(
            env,
            [lattice.meet(applied_number, applied_integer)],
            [applied_integer]
        );

        assert_equiv!(
            env,
            [lattice.meet(applied_number, primitive_integer)],
            [applied_integer]
        );

        assert_equiv!(
            env,
            [lattice.meet(primitive_number, applied_integer)],
            [primitive_integer]
        );
    }

    #[test]
    fn join() {
        // Join should wrap the result of the underlying operation
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let mut lattice = LatticeEnvironment::new(&env);

        let primitive_number = primitive!(env, PrimitiveType::Number);
        let primitive_integer = primitive!(env, PrimitiveType::Integer);

        let applied_number = apply!(env, primitive_number, []);
        let applied_integer = apply!(env, primitive_integer, []);

        assert_equiv!(
            env,
            [lattice.join(applied_number, applied_integer)],
            [applied_number]
        );

        assert_equiv!(
            env,
            [lattice.join(applied_number, primitive_number)],
            [applied_number]
        );

        assert_equiv!(
            env,
            [lattice.join(primitive_number, applied_number)],
            [applied_number]
        );
    }

    #[test]
    fn join_generic_argument_merging() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let mut lattice = LatticeEnvironment::new(&env);
        lattice.without_simplify();

        // Create base types
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        let boolean = primitive!(env, PrimitiveType::Boolean);

        // Create generic argument IDs
        let argument1 = env.counter.generic_argument.next();
        let argument2 = env.counter.generic_argument.next();

        // Create Apply types with different substitutions
        let apply1 = apply!(
            env,
            number,
            [GenericSubstitution {
                argument: argument1,
                value: string,
            }]
        );

        let apply2 = apply!(
            env,
            number,
            [GenericSubstitution {
                argument: argument2,
                value: boolean,
            }]
        );

        // Join the types
        let result = lattice.join(apply1, apply2);

        let apply = env.r#type(result).kind.apply().expect("should be apply");

        assert_eq!(apply.substitutions.len(), 2);

        // Check that substitutions are sorted by argument ID
        assert_eq!(apply.substitutions[0].argument, argument1);
        assert_eq!(apply.substitutions[1].argument, argument2);

        // Check substitution values
        assert_equiv!(env, [apply.substitutions[0].value], [string]);
        assert_equiv!(env, [apply.substitutions[1].value], [boolean]);
    }

    #[test]
    fn join_same_generic_arguments() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let mut lattice = LatticeEnvironment::new(&env);
        lattice.without_simplify();

        // Create base types
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);
        let boolean = primitive!(env, PrimitiveType::Boolean);

        // Create generic argument IDs
        let argument1 = env.counter.generic_argument.next();

        // Create Apply types with different substitutions
        let apply1 = apply!(
            env,
            number,
            [GenericSubstitution {
                argument: argument1,
                value: string,
            }]
        );

        let apply2 = apply!(
            env,
            number,
            [GenericSubstitution {
                argument: argument1,
                value: boolean,
            }]
        );

        // Join the types
        let result = lattice.join(apply1, apply2);

        let apply = env.r#type(result).kind.apply().expect("should be apply");

        assert_eq!(apply.substitutions.len(), 2);

        // Check that substitutions are sorted by argument ID
        assert_eq!(apply.substitutions[0].argument, argument1);
        assert_eq!(apply.substitutions[1].argument, argument1);

        // Check substitution values
        assert_equiv!(env, [apply.substitutions[0].value], [string]);
        assert_equiv!(env, [apply.substitutions[1].value], [boolean]);
    }

    #[test]
    fn join_identical_generic_arguments() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let mut lattice = LatticeEnvironment::new(&env);
        lattice.without_simplify();

        // Create base types
        let number = primitive!(env, PrimitiveType::Number);
        let string = primitive!(env, PrimitiveType::String);

        // Create generic argument IDs
        let argument1 = env.counter.generic_argument.next();

        // Create Apply types with different substitutions
        let apply1 = apply!(
            env,
            number,
            [GenericSubstitution {
                argument: argument1,
                value: string,
            }]
        );

        let apply2 = apply!(
            env,
            number,
            [GenericSubstitution {
                argument: argument1,
                value: string,
            }]
        );

        // Join the types
        let result = lattice.join(apply1, apply2);

        let apply = env.r#type(result).kind.apply().expect("should be apply");

        assert_eq!(apply.substitutions.len(), 1);

        // Check that substitutions are sorted by argument ID
        assert_eq!(apply.substitutions[0].argument, argument1);

        // Check substitution values
        assert_equiv!(env, [apply.substitutions[0].value], [string]);
    }

    #[test]
    fn join_complex_substitution_merging() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let mut lattice = LatticeEnvironment::new(&env);
        lattice.without_simplify();

        // Create base types for substitution values
        let number = primitive!(env, PrimitiveType::Number);
        let integer = primitive!(env, PrimitiveType::Integer);
        let string = primitive!(env, PrimitiveType::String);
        let boolean = primitive!(env, PrimitiveType::Boolean);

        // Create several generic argument IDs
        let argument1 = env.counter.generic_argument.next();
        let argument2 = env.counter.generic_argument.next();
        let argument3 = env.counter.generic_argument.next();
        let argument4 = env.counter.generic_argument.next();

        // Create complex sets of substitutions for two Apply types:
        // 1. Identical substitutions (arg1:string in both)
        // 2. Same argument with different values (arg2:number and arg2:boolean)
        // 3. Unique arguments (arg3 only in first, arg4 only in second)

        let apply1 = apply!(
            env,
            number,
            [
                GenericSubstitution {
                    argument: argument1,
                    value: string,
                },
                GenericSubstitution {
                    argument: argument2,
                    value: number,
                },
                GenericSubstitution {
                    argument: argument3,
                    value: integer,
                },
            ]
        );

        let apply2 = apply!(
            env,
            number,
            [
                GenericSubstitution {
                    argument: argument1,
                    value: string,
                },
                GenericSubstitution {
                    argument: argument2,
                    value: boolean,
                },
                GenericSubstitution {
                    argument: argument4,
                    value: string,
                },
            ]
        );

        // Join the types with complex substitutions
        let result = lattice.join(apply1, apply2);
        let apply = env
            .r#type(result)
            .kind
            .apply()
            .expect("should be an apply type");

        // The result should have:
        // - One substitution for arg1 (deduped)
        // - Two substitutions for arg2 (different values)
        // - One substitution for arg3 (from first Apply)
        // - One substitution for arg4 (from second Apply)
        // So 5 total substitutions

        assert_eq!(
            *apply.substitutions,
            [
                GenericSubstitution {
                    argument: argument1,
                    value: string,
                },
                GenericSubstitution {
                    argument: argument2,
                    value: number,
                },
                GenericSubstitution {
                    argument: argument2,
                    value: boolean,
                },
                GenericSubstitution {
                    argument: argument3,
                    value: integer,
                },
                GenericSubstitution {
                    argument: argument4,
                    value: string,
                },
            ]
        );
    }

    #[test]
    fn bottom() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Verify that `is_bottom` simply delegates to the base type
        let apply_never = apply!(env, instantiate(&env, TypeKind::Never), []);
        let mut analysis = AnalysisEnvironment::new(&env);
        assert!(analysis.is_bottom(apply_never));

        let apply_string = apply!(env, primitive!(env, PrimitiveType::String), []);
        assert!(!analysis.is_bottom(apply_string));
    }

    #[test]
    fn top() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Verify that `is_top` simply delegates to the base type
        let apply_unknown = apply!(env, instantiate(&env, TypeKind::Unknown), []);
        let mut analysis = AnalysisEnvironment::new(&env);
        assert!(analysis.is_top(apply_unknown));

        let apply_string = apply!(env, primitive!(env, PrimitiveType::String), []);
        assert!(!analysis.is_top(apply_string));
    }

    #[test]
    fn concrete() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Verify that `is_concrete` simply delegates to the base type
        let apply_never = apply!(env, instantiate(&env, TypeKind::Never), []);
        let mut analysis = AnalysisEnvironment::new(&env);
        assert!(analysis.is_concrete(apply_never));

        let apply_infer = apply!(env, instantiate_infer(&env, 0_u32), []);
        assert!(!analysis.is_concrete(apply_infer));
    }

    #[test]
    fn recursive() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // type that's `type A = Apply<(name: A), []>`
        let recursive = env.types.intern(|id| PartialType {
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Apply(Apply {
                base: r#struct!(env, [], [struct_field!(env, "A", id.value())]),
                substitutions: GenericSubstitutions::empty(),
            })),
        });
        let mut analysis = AnalysisEnvironment::new(&env);
        assert!(analysis.is_recursive(recursive.id));

        let apply_infer = apply!(env, instantiate_infer(&env, 0_u32), []);
        assert!(!analysis.is_recursive(apply_infer));
    }

    #[test]
    fn distribute_union() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // If the inner type is just a single type, we should just return ourselves
        let string = apply!(env, primitive!(env, PrimitiveType::String), []);
        let mut analysis = AnalysisEnvironment::new(&env);
        assert_eq!(analysis.distribute_union(string), [string]);

        // If the inner type is distributing, we should distribute ourselves as well
        let union = apply!(
            env,
            union!(
                env,
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::String)
                ]
            ),
            []
        );
        let mut analysis = AnalysisEnvironment::new(&env);
        assert_equiv!(
            env,
            analysis.distribute_union(union),
            [
                apply!(env, primitive!(env, PrimitiveType::Number), []),
                apply!(env, primitive!(env, PrimitiveType::String), [])
            ]
        );
    }

    #[test]
    fn distribute_intersection() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // If the inner type is just a single type, we should just return ourselves
        let string = apply!(env, primitive!(env, PrimitiveType::String), []);
        let mut analysis = AnalysisEnvironment::new(&env);
        assert_eq!(analysis.distribute_intersection(string), [string]);

        // If the inner type is distributing, we should distribute ourselves as well
        let union = apply!(
            env,
            intersection!(
                env,
                [
                    primitive!(env, PrimitiveType::Number),
                    primitive!(env, PrimitiveType::String)
                ]
            ),
            []
        );
        let mut analysis = AnalysisEnvironment::new(&env);
        assert_equiv!(
            env,
            analysis.distribute_intersection(union),
            [
                apply!(env, primitive!(env, PrimitiveType::Number), []),
                apply!(env, primitive!(env, PrimitiveType::String), [])
            ]
        );
    }

    #[test]
    fn is_subtype_of() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Apply should be transparent in is_subtype_of checks
        let integer = apply!(env, primitive!(env, PrimitiveType::Integer), []);
        let number = apply!(env, primitive!(env, PrimitiveType::Number), []);

        let mut analysis = AnalysisEnvironment::new(&env);
        assert!(analysis.is_subtype_of(integer, number));
        assert!(!analysis.is_subtype_of(number, integer));
    }

    #[test]
    fn simplify() {
        // Simplify should be transparent if the type is not concrete
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let mut simplify = SimplifyEnvironment::new(&env);
        let infer = apply!(env, instantiate_infer(&env, 0_u32), []);
        let number = apply!(env, primitive!(env, PrimitiveType::Number), []);

        assert_eq!(simplify.simplify(infer), infer);
        assert_equiv!(
            env,
            [simplify.simplify(number)],
            [primitive!(env, PrimitiveType::Number)]
        );
    }

    #[test]
    fn collect_constraints() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let mut infer = InferenceEnvironment::new(&env);

        let subtype = apply!(
            env,
            instantiate(&env, TypeKind::Never),
            [GenericSubstitution {
                argument: GenericArgumentId::new(0),
                value: primitive!(env, PrimitiveType::Number)
            }]
        );

        let supertype = primitive!(env, PrimitiveType::String);

        infer.collect_constraints(subtype, supertype);

        let constraints = infer.take_constraints();
        assert_eq!(
            constraints,
            [Constraint::Equals {
                variable: Variable::synthetic(VariableKind::Generic(GenericArgumentId::new(0))),
                r#type: primitive!(env, PrimitiveType::Number)
            }]
        );
    }

    #[test]
    fn collect_structural_constraints() {
        // Nothing should happen as they are invariant
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let mut infer = InferenceEnvironment::new(&env);

        let subtype = apply!(
            env,
            instantiate(&env, TypeKind::Never),
            [GenericSubstitution {
                argument: GenericArgumentId::new(0),
                value: primitive!(env, PrimitiveType::Number)
            }]
        );

        infer.collect_structural_edges(
            subtype,
            PartialStructuralEdge::Source(Variable::synthetic(VariableKind::Hole(HoleId::new(0)))),
        );

        let constraints = infer.take_constraints();
        assert_eq!(constraints, []);
    }
}
