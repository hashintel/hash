use core::ops::Deref;

use pretty::{DocAllocator as _, RcAllocator, RcDoc};

use super::{GenericArgumentId, Param};
use crate::{
    collection::SmallVec,
    intern::Interned,
    pretty::{ORANGE, PrettyPrint, PrettyRecursionBoundary, RED},
    span::SpanId,
    symbol::Ident,
    r#type::{
        PartialType, Type, TypeId,
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment,
            instantiate::{InstantiateEnvironment, SubstitutionState},
        },
        inference::{Inference, PartialStructuralEdge},
        kind::TypeKind,
        lattice::{Lattice, Projection},
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct GenericSubstitution {
    pub argument: GenericArgumentId,
    pub value: TypeId,
}

impl<'heap> PrettyPrint<'heap> for GenericSubstitution {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, anstyle::Style> {
        let name = format!("?{}", self.argument);

        RcDoc::text(name)
            .annotate(ORANGE)
            .append(RcDoc::space())
            .append("=")
            .append(RcDoc::softline())
            .group()
            .append(boundary.pretty_type(env, self.value).group())
            .group()
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
        let mut vec = SmallVec::with_capacity(self.len() + other.len());

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

impl<'heap> PrettyPrint<'heap> for GenericSubstitutions<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, anstyle::Style> {
        match self.as_slice() {
            [] => RcAllocator.nil(),
            slice => RcAllocator.intersperse(
                slice
                    .iter()
                    .map(|substitution| substitution.pretty(env, boundary)),
                RcDoc::text(",").append(RcDoc::softline()),
            ),
        }
        .nest(1)
        .group()
        .angles()
        .group()
        .into_doc()
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

    fn projection(
        self: Type<'heap, Self>,
        field: Ident<'heap>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> Projection {
        env.projection(self.kind.base, field)
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

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        env.is_equivalent(self.kind.base, other.kind.base)
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        let (guard, id) = env.provision(self.id);

        let base = env.simplify(self.kind.base);

        // We can only safely replace ourselves in the case that we're not referenced by anyone.
        // This is not the same as checking if the base type is recursive, while the base type might
        // be recursive, it doesn't guarantee that we're actually referenced in the recursive type.
        if env.is_concrete(base) && !guard.is_used() {
            return base;
        }

        env.intern_provisioned(
            id,
            PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Apply(Apply {
                    base,
                    substitutions: self.kind.substitutions,
                })),
            },
        )
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
        let (guard_id, id) = env.provision(self.id);
        let (_guard, substitutions, substitution_state) =
            env.instantiate_substitutions(self.kind.substitutions);

        if substitution_state == SubstitutionState::IdentitiesOnly || substitutions.is_empty() {
            // When we have only identity substitutions or no substitutions at all,
            // we can use regular instantiation for the base type because the result
            // won't be generic over the substitutions
            let base = env.instantiate(self.kind.base);

            // If there are no effective substitutions, this Apply is redundant and
            // can potentially be simplified to just the base type
            if guard_id.is_used() {
                // However, if the type is referenced elsewhere, we must preserve the ID
                // by closing the reference. We use an empty substitution map which is
                // semantically equivalent to having no substitutions
                return env.intern_provisioned(
                    id,
                    PartialType {
                        span: self.span,
                        kind: env.intern_kind(TypeKind::Apply(Self {
                            base,
                            substitutions: GenericSubstitutions::empty(),
                        })),
                    },
                );
            }

            return base;
        }

        // For non-identity substitutions, we force instantiation of the base type
        // to ensure we generate a new type instance rather than reusing an existing one
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

impl<'heap> PrettyPrint<'heap> for Apply<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, anstyle::Style> {
        boundary
            .pretty_type(env, self.base)
            .append(RcDoc::softline())
            .group()
            .append(RcDoc::text("where").annotate(RED))
            .append(self.substitutions.pretty(env, boundary).group())
            .group()
    }
}

#[cfg(test)]
mod tests {
    #![expect(clippy::min_ident_chars, clippy::missing_asserts_for_indexing)]

    use super::{Apply, GenericSubstitution};
    use crate::{
        heap::Heap,
        pretty::{PrettyOptions, PrettyPrint as _},
        span::SpanId,
        r#type::{
            PartialType,
            environment::{
                AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
                SimplifyEnvironment, instantiate::InstantiateEnvironment,
            },
            inference::{Constraint, PartialStructuralEdge, Variable, VariableKind},
            kind::{
                Generic, GenericArgument, IntersectionType, PrimitiveType, StructType, TypeKind,
                UnionType,
                generic::{GenericArgumentId, GenericSubstitutions},
                infer::HoleId,
                r#struct::StructField,
                test::{
                    apply, assert_equiv, generic, intersection, primitive, r#struct, struct_field,
                    union,
                },
            },
            lattice::test::assert_lattice_laws,
            test::{instantiate, instantiate_infer, instantiate_param},
        },
    };

    #[test]
    fn lattice_laws() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let number = apply!(env, primitive!(env, PrimitiveType::Number), []);
        let string = apply!(env, primitive!(env, PrimitiveType::String), []);
        let boolean = apply!(env, primitive!(env, PrimitiveType::Boolean), []);

        assert_lattice_laws(&env, number, string, boolean);
    }

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
                base: r#struct!(env, [struct_field!(env, "A", id.value())]),
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
    fn is_equivalent() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Apply should be transparent in is_subtype_of checks
        let integer = apply!(env, primitive!(env, PrimitiveType::Integer), []);
        let number = apply!(env, primitive!(env, PrimitiveType::Number), []);

        let mut analysis = AnalysisEnvironment::new(&env);
        assert!(analysis.is_equivalent(integer, integer));
        assert!(!analysis.is_equivalent(number, integer));
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
    fn simplify_instantiate_recursive() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let t = env.counter.generic_argument.next();

        let recursive = env.types.intern(|recursive| PartialType {
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Apply(Apply {
                base: generic!(
                    env,
                    r#struct!(env, [struct_field!(env, "foo", recursive.value())]),
                    [GenericArgument {
                        id: t,
                        name: heap.intern_symbol("T"),
                        constraint: None
                    }]
                ),
                substitutions: env.intern_generic_substitutions(&mut [GenericSubstitution {
                    argument: t,
                    value: instantiate_param(&env, t),
                }]),
            })),
        });

        let mut simplify = SimplifyEnvironment::new(&env);
        let mut instantiate = InstantiateEnvironment::new(&env);
        let result_id = simplify.simplify(instantiate.instantiate(recursive.id));

        // The type is complicated enough that it isn't feasible to test it through assertions.
        insta::assert_snapshot!(
            env.r#type(result_id).pretty_print(
                &env,
                PrettyOptions::default()
                    .with_depth_tracking()
                    .without_color()
            )
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

        let supertype = apply!(env, primitive!(env, PrimitiveType::String), []);

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

    #[test]
    fn instantiate_generic() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let argument = env.counter.generic_argument.next();

        let foo = generic!(
            env,
            r#struct!(
                env,
                [struct_field!(env, "foo", instantiate_param(&env, argument))]
            ),
            [GenericArgument {
                id: argument,
                name: heap.intern_symbol("T"),
                constraint: None
            }]
        );

        let apply = apply!(
            env,
            foo,
            [GenericSubstitution {
                argument,
                value: primitive!(env, PrimitiveType::String)
            }]
        );

        let mut instantiate = InstantiateEnvironment::new(&env);

        let result = instantiate.instantiate(apply);
        let result = env.r#type(result).kind.apply().expect("Should be apply");

        assert_eq!(result.substitutions.len(), 1);
        assert_ne!(result.substitutions[0].argument, argument);

        let foo = env
            .r#type(result.base)
            .kind
            .generic()
            .expect("Should be generic");

        assert_eq!(foo.arguments[0].id, result.substitutions[0].argument);

        let foo = env
            .r#type(foo.base)
            .kind
            .r#struct()
            .expect("Should be struct");

        let field = foo.fields[0].value;
        let &field = env.r#type(field).kind.param().expect("Should be param");
        assert_eq!(field.argument, result.substitutions[0].argument);
    }

    #[test]
    fn instantiate_distinct() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let argument = env.counter.generic_argument.next();

        let foo = generic!(
            env,
            r#struct!(
                env,
                [struct_field!(env, "foo", instantiate_param(&env, argument))]
            ),
            [GenericArgument {
                id: argument,
                name: heap.intern_symbol("T"),
                constraint: None
            }]
        );

        let a = apply!(
            env,
            foo,
            [GenericSubstitution {
                argument,
                value: primitive!(env, PrimitiveType::String)
            }]
        );

        let b = apply!(
            env,
            foo,
            [GenericSubstitution {
                argument,
                value: primitive!(env, PrimitiveType::Integer)
            }]
        );

        let mut instantiate = InstantiateEnvironment::new(&env);

        let mut results = Vec::with_capacity(2);
        for id in [a, b] {
            let result = instantiate.instantiate(id);
            let &result = env.r#type(result).kind.apply().expect("Should be apply");
            results.push(result);

            assert_eq!(result.substitutions.len(), 1);
            assert_ne!(result.substitutions[0].argument, argument);

            let foo = env
                .r#type(result.base)
                .kind
                .generic()
                .expect("Should be struct");

            assert_eq!(foo.arguments[0].id, result.substitutions[0].argument);

            let foo = env
                .r#type(foo.base)
                .kind
                .r#struct()
                .expect("Should be struct");

            let field = foo.fields[0].value;
            let &field = env.r#type(field).kind.param().expect("Should be param");
            assert_eq!(field.argument, result.substitutions[0].argument);
        }

        // check that from the result both a and b are distinct
        let a = results[0];
        let b = results[1];
        assert_ne!(a.substitutions[0].argument, b.substitutions[0].argument);
    }

    #[test]
    fn instantiate_recursive() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // type Foo<T> = Foo<T> where<T = T>
        // a purely recursive type drops the apply wrapper
        let foo = env
            .types
            .intern(|id| {
                let argument = env.counter.generic_argument.next();

                PartialType {
                    span: SpanId::SYNTHETIC,
                    kind: env.intern_kind(TypeKind::Generic(Generic {
                        base: r#struct!(
                            env,
                            [struct_field!(
                                env,
                                "foo",
                                apply!(
                                    env,
                                    id.value(),
                                    [GenericSubstitution {
                                        argument,
                                        value: instantiate_param(&env, argument)
                                    }]
                                )
                            )]
                        ),
                        arguments: env.intern_generic_arguments(&mut [GenericArgument {
                            id: argument,
                            name: heap.intern_symbol("T"),
                            constraint: None,
                        }]),
                    })),
                }
            })
            .id;

        let mut instantiate = InstantiateEnvironment::new(&env);

        let result_id = instantiate.instantiate(foo);
        let generic = env
            .r#type(result_id)
            .kind
            .generic()
            .expect("should be generic");

        let r#struct = env
            .r#type(generic.base)
            .kind
            .r#struct()
            .expect("should be struct");

        // The inner type should be the exact same id as the outer type
        assert_eq!(r#struct.fields[0].value, result_id);
    }

    #[test]
    fn instantiated_nested() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let foo_argument = env.counter.generic_argument.next();
        let bar_argument = env.counter.generic_argument.next();

        // type Foo<T> = (foo: T)
        let foo = generic!(
            env,
            r#struct!(
                env,
                [struct_field!(
                    env,
                    "foo",
                    instantiate_param(&env, foo_argument)
                )]
            ),
            [GenericArgument {
                id: foo_argument,
                name: heap.intern_symbol("T"),
                constraint: None
            }]
        );

        // type Bar<U> = (bar: Foo<Bar<U>>)
        let bar = env
            .types
            .intern(|bar| PartialType {
                span: SpanId::SYNTHETIC,
                kind: env.intern_kind(TypeKind::Generic(Generic {
                    base: r#struct!(
                        env,
                        [struct_field!(
                            env,
                            "bar",
                            apply!(
                                env,
                                foo,
                                [GenericSubstitution {
                                    argument: foo_argument,
                                    value: apply!(
                                        env,
                                        bar.value(),
                                        [GenericSubstitution {
                                            argument: bar_argument,
                                            value: instantiate_param(&env, bar_argument)
                                        }]
                                    )
                                }]
                            )
                        )]
                    ),
                    arguments: env.intern_generic_arguments(&mut [GenericArgument {
                        id: bar_argument,
                        name: heap.intern_symbol("U"),
                        constraint: None,
                    }]),
                })),
            })
            .id;

        let mut instantiate = InstantiateEnvironment::new(&env);

        let result_id = instantiate.instantiate(bar);
        let result_id = SimplifyEnvironment::new(&env).simplify(result_id);

        // The type is complicated enough that it isn't feasible to test it through assertions.
        insta::assert_snapshot!(
            &env.r#type(result_id).pretty_print(
                &env,
                PrettyOptions::default()
                    .with_depth_tracking()
                    .without_color()
            )
        );
    }

    #[test]
    fn instantiate_mutually_recursive() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let a = env.types.intern(|a_id| {
            let t = env.counter.generic_argument.next(); // T
            let u = env.counter.generic_argument.next(); // U

            // type B<U> = (a: A<T> where T = U)
            let b_id = generic!(
                env,
                r#struct!(
                    env,
                    [
                        struct_field!(
                            env,
                            "a",
                            apply!(
                                env,
                                a_id.value(),
                                [GenericSubstitution {
                                    argument: t,
                                    value: instantiate_param(&env, u)
                                }]
                            )
                        ),
                        // We need the additional field, otherwise the generic and apply type are
                        // optimized away
                        struct_field!(env, "b", instantiate_param(&env, u))
                    ]
                ),
                [GenericArgument {
                    id: u,
                    name: heap.intern_symbol("U"),
                    constraint: None
                }]
            );

            // type A<T> = (b: B<U> where U = T)
            PartialType {
                span: SpanId::SYNTHETIC,
                kind: env.intern_kind(TypeKind::Generic(Generic {
                    base: r#struct!(
                        env,
                        [struct_field!(
                            env,
                            "b",
                            apply!(
                                env,
                                b_id,
                                [GenericSubstitution {
                                    argument: u,
                                    value: instantiate_param(&env, t)
                                }]
                            )
                        )]
                    ),
                    arguments: env.intern_generic_arguments(&mut [GenericArgument {
                        id: t,
                        name: heap.intern_symbol("T"),
                        constraint: None,
                    }]),
                })),
            }
        });

        let mut instantiate = InstantiateEnvironment::new(&env);

        let result_id = instantiate.instantiate(a.id);
        let result_id = SimplifyEnvironment::new(&env).simplify(result_id);

        // The type is complicated enough that it isn't feasible to test it through assertions.
        insta::assert_snapshot!(
            env.r#type(result_id).pretty_print(
                &env,
                PrettyOptions::default()
                    .with_depth_tracking()
                    .without_color()
            )
        );
    }

    #[test]
    fn simplify_recursive_unused() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let a = env.types.intern(|a_id| {
            let t = env.counter.generic_argument.next(); // T
            let u = env.counter.generic_argument.next(); // U

            // type B<U> = (a: A<T> where T = U)
            let b_id = generic!(
                env,
                r#struct!(
                    env,
                    [struct_field!(
                        env,
                        "a",
                        apply!(
                            env,
                            a_id.value(),
                            [GenericSubstitution {
                                argument: t,
                                value: instantiate_param(&env, u)
                            }]
                        )
                    )]
                ),
                [GenericArgument {
                    id: u,
                    name: heap.intern_symbol("U"),
                    constraint: None
                }]
            );

            // type A<T> = (b: B<U> where U = T)
            PartialType {
                span: SpanId::SYNTHETIC,
                kind: env.intern_kind(TypeKind::Generic(Generic {
                    base: r#struct!(
                        env,
                        [struct_field!(
                            env,
                            "b",
                            apply!(
                                env,
                                b_id,
                                [GenericSubstitution {
                                    argument: u,
                                    value: instantiate_param(&env, t)
                                }]
                            )
                        )]
                    ),
                    arguments: env.intern_generic_arguments(&mut [GenericArgument {
                        id: t,
                        name: heap.intern_symbol("T"),
                        constraint: None,
                    }]),
                })),
            }
        });

        let mut instantiate = InstantiateEnvironment::new(&env);

        let result_id = instantiate.instantiate(a.id);
        let result_id = SimplifyEnvironment::new(&env).simplify(result_id);

        // The type is complicated enough that it isn't feasible to test it through assertions.
        insta::assert_snapshot!(
            env.r#type(result_id).pretty_print(
                &env,
                PrettyOptions::default()
                    .with_depth_tracking()
                    .without_color()
            )
        );
    }

    #[test]
    fn instantiate_different_substitutions() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let foo_argument = env.counter.generic_argument.next();

        // type Foo<T> = (foo: T)
        let foo = generic!(
            env,
            r#struct!(
                env,
                [struct_field!(
                    env,
                    "foo",
                    instantiate_param(&env, foo_argument)
                )]
            ),
            [GenericArgument {
                id: foo_argument,
                name: heap.intern_symbol("T"),
                constraint: None
            }]
        );

        // type Bar = (bar: Foo<String>, baz: Foo<Number>)
        let bar = r#struct!(
            env,
            [
                struct_field!(
                    env,
                    "bar",
                    apply!(
                        env,
                        foo,
                        [GenericSubstitution {
                            argument: foo_argument,
                            value: primitive!(env, PrimitiveType::String)
                        }]
                    )
                ),
                struct_field!(
                    env,
                    "baz",
                    apply!(
                        env,
                        foo,
                        [GenericSubstitution {
                            argument: foo_argument,
                            value: primitive!(env, PrimitiveType::Number)
                        }]
                    )
                )
            ]
        );

        let mut instantiate = InstantiateEnvironment::new(&env);
        let result_id = instantiate.instantiate(bar);

        // The type is complicated enough that it isn't feasible to test it through assertions.
        insta::assert_snapshot!(
            env.r#type(result_id).pretty_print(
                &env,
                PrettyOptions::default()
                    .with_depth_tracking()
                    .without_color()
            )
        );
    }

    #[test]
    fn instantiate_partial() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let t = env.counter.generic_argument.next();
        let u = env.counter.generic_argument.next();

        // type Foo<T, U> = (foo: Foo<T, String>)
        let foo = env
            .types
            .intern(|foo| PartialType {
                span: SpanId::SYNTHETIC,
                kind: env.intern_kind(TypeKind::Generic(Generic {
                    base: r#struct!(
                        env,
                        [struct_field!(
                            env,
                            "foo",
                            apply!(
                                env,
                                foo.value(),
                                [
                                    GenericSubstitution {
                                        argument: t,
                                        value: instantiate_param(&env, t)
                                    },
                                    GenericSubstitution {
                                        argument: u,
                                        value: primitive!(env, PrimitiveType::String)
                                    }
                                ]
                            )
                        )]
                    ),
                    arguments: env.intern_generic_arguments(&mut [
                        GenericArgument {
                            id: t,
                            name: heap.intern_symbol("T"),
                            constraint: None,
                        },
                        GenericArgument {
                            id: u,
                            name: heap.intern_symbol("U"),
                            constraint: None,
                        },
                    ]),
                })),
            })
            .id;

        let mut instantiate = InstantiateEnvironment::new(&env);
        let result_id = instantiate.instantiate(foo);

        // The type is complicated enough that it isn't feasible to test it through assertions.
        insta::assert_snapshot!(
            env.r#type(result_id).pretty_print(
                &env,
                PrettyOptions::default()
                    .with_depth_tracking()
                    .without_color()
            )
        );
    }
}
