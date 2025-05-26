pub mod apply;
pub mod param;

use core::{hash::Hash, ops::Deref};

use pretty::{DocAllocator as _, RcAllocator, RcDoc};

pub use self::{
    apply::{Apply, GenericSubstitution, GenericSubstitutions},
    param::Param,
};
use super::TypeKind;
use crate::{
    collection::{SmallVec, TinyVec},
    intern::Interned,
    newtype, newtype_producer,
    pretty::{ORANGE, PrettyPrint, PrettyRecursionBoundary},
    span::SpanId,
    symbol::{Ident, Symbol},
    r#type::{
        PartialType, Type, TypeId,
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment,
            instantiate::{ArgumentsState, InstantiateEnvironment},
        },
        inference::{Inference, PartialStructuralEdge},
        lattice::{Lattice, Projection},
    },
};

newtype!(
    pub struct GenericArgumentId(u32 is 0..=0xFFFF_FF00)
);

newtype_producer!(pub struct GenericArgumentIdProducer(GenericArgumentId));

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct GenericArgumentReference<'heap> {
    pub id: GenericArgumentId,
    pub name: Symbol<'heap>,
}

impl<'heap> GenericArgumentReference<'heap> {
    #[must_use]
    pub const fn with_constraint(self, constraint: Option<TypeId>) -> GenericArgument<'heap> {
        let Self { id, name } = self;

        GenericArgument {
            id,
            name,
            constraint,
        }
    }
}

impl<'heap> From<GenericArgument<'heap>> for GenericArgumentReference<'heap> {
    fn from(argument: GenericArgument<'heap>) -> Self {
        Self {
            id: argument.id,
            name: argument.name,
        }
    }
}

impl<'heap> PrettyPrint<'heap> for GenericArgumentReference<'heap> {
    fn pretty(
        &self,
        _: &Environment<'heap>,
        _: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, anstyle::Style> {
        RcDoc::text(format!("{}?{}", self.name, self.id)).annotate(ORANGE)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct AnonymousGenericArgument {
    pub id: GenericArgumentId,

    pub constraint: Option<TypeId>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct GenericArgument<'heap> {
    pub id: GenericArgumentId,
    pub name: Symbol<'heap>,

    // The initial type constraint (if present)
    pub constraint: Option<TypeId>,
}

impl<'heap> GenericArgument<'heap> {
    #[must_use]
    pub const fn as_anonymous(&self) -> AnonymousGenericArgument {
        AnonymousGenericArgument {
            id: self.id,
            constraint: self.constraint,
        }
    }

    #[must_use]
    pub const fn as_reference(&self) -> GenericArgumentReference<'heap> {
        GenericArgumentReference {
            id: self.id,
            name: self.name,
        }
    }
}

impl<'heap> PrettyPrint<'heap> for GenericArgument<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, anstyle::Style> {
        let name = format!("{}?{}", self.name, self.id);

        let mut doc = RcDoc::text(name).annotate(ORANGE).group();

        if let Some(constraint) = self.constraint {
            doc = doc
                .append(RcDoc::text(":"))
                .append(RcDoc::softline())
                .append(boundary.pretty_type(env, constraint).group())
                .group();
        }

        doc
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct GenericArguments<'heap>(Option<Interned<'heap, [GenericArgument<'heap>]>>);

impl<'heap> GenericArguments<'heap> {
    #[must_use]
    pub const fn empty() -> Self {
        Self(None)
    }

    /// Create a new `GenericArguments` from a slice of `GenericArgument`s.
    ///
    /// The caller must ensure that the slice is sorted by argument ID and contains no duplicates.
    ///
    /// You should probably use `Environment::intern_generic_arguments` instead.
    #[must_use]
    pub const fn from_slice_unchecked(slice: Interned<'heap, [GenericArgument<'heap>]>) -> Self {
        Self(Some(slice))
    }

    #[must_use]
    pub const fn as_slice(&self) -> &[GenericArgument<'heap>] {
        match self.0 {
            Some(Interned(slice, _)) => slice,
            None => &[] as &[GenericArgument<'heap>],
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

        env.intern_generic_arguments(&mut vec)
    }
}

impl<'heap> AsRef<[GenericArgument<'heap>]> for GenericArguments<'heap> {
    fn as_ref(&self) -> &[GenericArgument<'heap>] {
        self.as_slice()
    }
}

impl<'heap> Deref for GenericArguments<'heap> {
    type Target = [GenericArgument<'heap>];

    fn deref(&self) -> &Self::Target {
        self.as_slice()
    }
}

impl<'heap> PrettyPrint<'heap> for GenericArguments<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, anstyle::Style> {
        match self.as_slice() {
            [] => return RcDoc::nil(),
            arguments => RcAllocator.intersperse(
                arguments
                    .iter()
                    .map(|argument| argument.pretty(env, boundary)),
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
pub struct Generic<'heap> {
    pub base: TypeId,
    pub arguments: GenericArguments<'heap>,
}

impl<'heap> Generic<'heap> {
    fn wrap(
        span: SpanId,
        bases: TinyVec<TypeId>,
        arguments: GenericArguments<'heap>,
        env: &Environment<'heap>,
    ) -> TinyVec<TypeId> {
        bases
            .into_iter()
            .map(|base| {
                env.intern_type(PartialType {
                    span,
                    kind: env.intern_kind(TypeKind::Generic(Self { base, arguments })),
                })
            })
            .collect()
    }

    pub fn join_base(
        self,
        other: Self,
        env: &mut LatticeEnvironment<'_, 'heap>,
        span: SpanId,
    ) -> TinyVec<TypeId> {
        // As we require to wrap the result in our own type, we call the function directly
        let self_base = env.r#type(self.base);
        let other_base = env.r#type(other.base);

        let bases = self_base.join(other_base, env);

        let substitutions = self.arguments.merge(&other.arguments, env);

        Self::wrap(span, bases, substitutions, env)
    }

    pub fn meet_base(
        self,
        other: Self,
        env: &mut LatticeEnvironment<'_, 'heap>,
        span: SpanId,
    ) -> TinyVec<TypeId> {
        // As we require to wrap the result in our own type, we call the function directly
        let self_base = env.r#type(self.base);
        let other_base = env.r#type(other.base);

        let bases = self_base.meet(other_base, env);

        let substitutions = self.arguments.merge(&other.arguments, env);

        Self::wrap(span, bases, substitutions, env)
    }
}

impl<'heap> Lattice<'heap> for Generic<'heap> {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> TinyVec<TypeId> {
        self.kind.join_base(*other.kind, env, self.span)
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> TinyVec<TypeId> {
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
    ) -> SmallVec<TypeId> {
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
                    kind: env.intern_kind(TypeKind::Generic(Self {
                        base,
                        arguments: self.kind.arguments,
                    })),
                })
            })
            .collect()
    }

    fn distribute_intersection(
        self: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId> {
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
                    kind: env.intern_kind(TypeKind::Generic(Self {
                        base,
                        arguments: self.kind.arguments,
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
        // A concrete type is fully monomorphic and no longer requires any generic arguments.
        if env.is_concrete(base) && !guard.is_used() {
            return base;
        }

        env.intern_provisioned(
            id,
            PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Generic(Self {
                    base,
                    arguments: self.kind.arguments,
                })),
            },
        )
    }
}

impl<'heap> Generic<'heap> {
    pub fn collect_argument_constraints(
        self,
        span: SpanId,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        for &argument in &*self.arguments {
            let Some(constraint) = argument.constraint else {
                continue;
            };

            let param = env.intern_type(PartialType {
                span,
                kind: env.intern_kind(TypeKind::Param(Param {
                    argument: argument.id,
                })),
            });

            // if `T: Number`, than `T <: Number`.
            env.in_covariant(|env| env.collect_constraints(param, constraint));
        }
    }

    pub fn collect_argument_structural_edges(
        self,
        variable: PartialStructuralEdge,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        // as arguments are covariant, we collect structural edges for each argument (if they have a
        // constraint)
        for &argument in &*self.arguments {
            let Some(constraint) = argument.constraint else {
                continue;
            };

            env.in_covariant(|env| env.collect_structural_edges(constraint, variable));
        }
    }
}

impl<'heap> Inference<'heap> for Generic<'heap> {
    fn collect_constraints(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        // We do not really care for the underlying type, we just want to collect our constraints
        self.kind.collect_argument_constraints(self.span, env);
        supertype
            .kind
            .collect_argument_constraints(supertype.span, env);

        env.collect_constraints(self.kind.base, supertype.kind.base);
    }

    fn collect_structural_edges(
        self: Type<'heap, Self>,
        variable: PartialStructuralEdge,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        self.kind.collect_argument_structural_edges(variable, env);

        env.collect_structural_edges(self.kind.base, variable);
    }

    fn instantiate(self: Type<'heap, Self>, env: &mut InstantiateEnvironment<'_, 'heap>) -> TypeId {
        let (guard_id, id) = env.provision(self.id);
        let (_guard, arguments, state) = env.instantiate_arguments(self.kind.arguments);

        if state == ArgumentsState::IdentitiesOnly || arguments.is_empty() {
            // When we have no generics at all, or the generics simply all map to themselves, we can
            // use regular instantiation for the base type because the result be any different /
            // dependent on the generics.
            let base = env.instantiate(self.kind.base);

            // If there are no effective generics, this Generic is redundant and
            // can potentially be simplified to just the base type
            if guard_id.is_used() {
                // However, if the type is referenced elsewhere, we must preserve the ID
                // by closing the reference. We use an empty generics map which is
                // semantically equivalent to having no generics
                return env.intern_provisioned(
                    id,
                    PartialType {
                        span: self.span,
                        kind: env.intern_kind(TypeKind::Generic(Self {
                            base,
                            arguments: GenericArguments::empty(),
                        })),
                    },
                );
            }

            return base;
        }

        // For non-identity generics, we force instantiation of the base type
        // to ensure we generate a new type instance that references the new arguments, instead of
        // reusing an existing one.
        let base = env.force_instantiate(self.kind.base);

        env.intern_provisioned(
            id,
            PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Generic(Self { base, arguments })),
            },
        )
    }
}

impl<'heap> PrettyPrint<'heap> for Generic<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, anstyle::Style> {
        boundary.pretty_generic_type(env, self.base, self.arguments)
    }
}

#[cfg(test)]
mod tests {
    #![expect(clippy::missing_asserts_for_indexing)]
    use crate::{
        heap::Heap,
        pretty::PrettyPrint as _,
        span::SpanId,
        r#type::{
            PartialType,
            environment::{
                AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
                SimplifyEnvironment, instantiate::InstantiateEnvironment,
            },
            inference::{Constraint, PartialStructuralEdge, Variable, VariableKind},
            kind::{
                Generic, GenericArgument, GenericArguments, IntersectionType, PrimitiveType,
                StructType, TypeKind, UnionType,
                generic::GenericArgumentId,
                infer::HoleId,
                r#struct::StructField,
                test::{
                    assert_equiv, generic, intersection, primitive, r#struct, struct_field, union,
                },
            },
            lattice::test::assert_lattice_laws,
            test::{instantiate, instantiate_infer},
        },
    };

    #[test]
    fn lattice_laws() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let number = generic!(env, primitive!(env, PrimitiveType::Number), []);
        let string = generic!(env, primitive!(env, PrimitiveType::String), []);
        let boolean = generic!(env, primitive!(env, PrimitiveType::Boolean), []);

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

        let applied_number = generic!(env, primitive_number, []);
        let applied_integer = generic!(env, primitive_integer, []);

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

        let applied_number = generic!(env, primitive_number, []);
        let applied_integer = generic!(env, primitive_integer, []);

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

        // Create generic argument IDs
        let argument1 = env.counter.generic_argument.next();
        let argument2 = env.counter.generic_argument.next();

        // Create Apply types with different substitutions
        let generic1 = generic!(
            env,
            number,
            [GenericArgument {
                id: argument1,
                name: heap.intern_symbol("T"),
                constraint: None
            }]
        );

        let generic2 = generic!(
            env,
            number,
            [GenericArgument {
                id: argument2,
                name: heap.intern_symbol("U"),
                constraint: None
            }]
        );

        // Join the types
        let result = lattice.join(generic1, generic2);

        let generic = env
            .r#type(result)
            .kind
            .generic()
            .expect("should be generic");

        assert_eq!(generic.arguments.len(), 2);

        // Check that generic are sorted by argument ID
        assert_eq!(generic.arguments[0].id, argument1);
        assert_eq!(generic.arguments[1].id, argument2);
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
        let generic1 = generic!(
            env,
            number,
            [GenericArgument {
                id: argument1,
                name: heap.intern_symbol("T"),
                constraint: Some(string),
            }]
        );

        let generic2 = generic!(
            env,
            number,
            [GenericArgument {
                id: argument1,
                name: heap.intern_symbol("T"),
                constraint: Some(boolean),
            }]
        );

        // Join the types
        let result = lattice.join(generic1, generic2);

        let generic = env
            .r#type(result)
            .kind
            .generic()
            .expect("should be generic");

        assert_eq!(generic.arguments.len(), 2);

        // Check that substitutions are sorted by argument ID
        assert_eq!(generic.arguments[0].id, argument1);
        assert_eq!(generic.arguments[1].id, argument1);

        // Check substitution values
        assert_equiv!(
            env,
            [generic.arguments[0].constraint.expect("should be some")],
            [string]
        );
        assert_equiv!(
            env,
            [generic.arguments[1].constraint.expect("should be some")],
            [boolean]
        );
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
        let apply1 = generic!(
            env,
            number,
            [GenericArgument {
                id: argument1,
                name: heap.intern_symbol("T"),
                constraint: Some(string),
            }]
        );

        let apply2 = generic!(
            env,
            number,
            [GenericArgument {
                id: argument1,
                name: heap.intern_symbol("T"),
                constraint: Some(string),
            }]
        );

        // Join the types
        let result = lattice.join(apply1, apply2);

        let generic = env
            .r#type(result)
            .kind
            .generic()
            .expect("should be generic");

        assert_eq!(generic.arguments.len(), 1);

        // Check that arguments are sorted by argument ID
        assert_eq!(generic.arguments[0].id, argument1);

        // Check substitution values
        assert_equiv!(
            env,
            [generic.arguments[0].constraint.expect("should be some")],
            [string]
        );
    }

    #[test]
    fn join_swallow_generic_arguments() {
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
        let apply1 = generic!(
            env,
            number,
            [GenericArgument {
                id: argument1,
                name: heap.intern_symbol("T"),
                constraint: Some(string),
            }]
        );

        let apply2 = generic!(
            env,
            number,
            [GenericArgument {
                id: argument1,
                name: heap.intern_symbol("T"),
                constraint: None,
            }]
        );

        // Join the types
        let result = lattice.join(apply1, apply2);

        let generic = env
            .r#type(result)
            .kind
            .generic()
            .expect("should be generic");

        assert_eq!(generic.arguments.len(), 1);

        // Check that arguments are sorted by argument ID
        assert_eq!(generic.arguments[0].id, argument1);

        // Check substitution values
        assert_equiv!(
            env,
            [generic.arguments[0].constraint.expect("should be some")],
            [string]
        );
    }

    #[test]
    #[expect(clippy::too_many_lines)]
    fn join_complex_generic_merging() {
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
        let argument5 = env.counter.generic_argument.next();

        // Create complex sets of substitutions for two Generic types:
        // 1. Identical substitutions (arg1:string in both)
        // 2. Same argument with different values (arg2:number and arg2:boolean)
        // 3. Unique arguments (arg3 only in first, arg4 only in second)
        // 4. Omitted unconstrained (arg5:number, `arg5:None`)
        let generic1 = generic!(
            env,
            number,
            [
                GenericArgument {
                    id: argument1,
                    name: heap.intern_symbol("T"),
                    constraint: Some(string),
                },
                GenericArgument {
                    id: argument2,
                    name: heap.intern_symbol("U"),
                    constraint: Some(number),
                },
                GenericArgument {
                    id: argument3,
                    name: heap.intern_symbol("V"),
                    constraint: Some(integer),
                },
                GenericArgument {
                    id: argument5,
                    name: heap.intern_symbol("X"),
                    constraint: Some(number),
                }
            ]
        );

        let generic2 = generic!(
            env,
            number,
            [
                GenericArgument {
                    id: argument1,
                    name: heap.intern_symbol("T"),
                    constraint: Some(string),
                },
                GenericArgument {
                    id: argument2,
                    name: heap.intern_symbol("U"),
                    constraint: Some(boolean),
                },
                GenericArgument {
                    id: argument4,
                    name: heap.intern_symbol("W"),
                    constraint: Some(string),
                },
                GenericArgument {
                    id: argument5,
                    name: heap.intern_symbol("X"),
                    constraint: None,
                }
            ]
        );

        // Join the types with complex generics
        let result = lattice.join(generic1, generic2);
        let generic = env
            .r#type(result)
            .kind
            .generic()
            .expect("should be an generic type");

        // The result should have:
        // - One generic for arg1 (deduped)
        // - Two generics for arg2 (different values)
        // - One generic for arg3 (from first Generic)
        // - One generic for arg4 (from second Generic)
        // So 5 total generics
        assert_eq!(
            *generic.arguments,
            [
                GenericArgument {
                    id: argument1,
                    name: heap.intern_symbol("T"),
                    constraint: Some(string),
                },
                GenericArgument {
                    id: argument2,
                    name: heap.intern_symbol("U"),
                    constraint: Some(number),
                },
                GenericArgument {
                    id: argument2,
                    name: heap.intern_symbol("U"),
                    constraint: Some(boolean),
                },
                GenericArgument {
                    id: argument3,
                    name: heap.intern_symbol("V"),
                    constraint: Some(integer),
                },
                GenericArgument {
                    id: argument4,
                    name: heap.intern_symbol("W"),
                    constraint: Some(string),
                },
                GenericArgument {
                    id: argument5,
                    name: heap.intern_symbol("X"),
                    constraint: Some(number),
                }
            ]
        );
    }

    #[test]
    fn bottom() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Verify that `is_bottom` simply delegates to the base type
        let apply_never = generic!(env, instantiate(&env, TypeKind::Never), []);
        let mut analysis = AnalysisEnvironment::new(&env);
        assert!(analysis.is_bottom(apply_never));

        let apply_string = generic!(env, primitive!(env, PrimitiveType::String), []);
        assert!(!analysis.is_bottom(apply_string));
    }

    #[test]
    fn top() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Verify that `is_top` simply delegates to the base type
        let apply_unknown = generic!(env, instantiate(&env, TypeKind::Unknown), []);
        let mut analysis = AnalysisEnvironment::new(&env);
        assert!(analysis.is_top(apply_unknown));

        let apply_string = generic!(env, primitive!(env, PrimitiveType::String), []);
        assert!(!analysis.is_top(apply_string));
    }

    #[test]
    fn concrete() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Verify that `is_concrete` simply delegates to the base type
        let apply_never = generic!(env, instantiate(&env, TypeKind::Never), []);
        let mut analysis = AnalysisEnvironment::new(&env);
        assert!(analysis.is_concrete(apply_never));

        let apply_infer = generic!(env, instantiate_infer(&env, 0_u32), []);
        assert!(!analysis.is_concrete(apply_infer));
    }

    #[test]
    fn recursive() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // type that's `type A = Apply<(name: A), []>`
        let recursive = env.types.intern(|id| PartialType {
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Generic(Generic {
                base: r#struct!(env, [struct_field!(env, "A", id.value())]),
                arguments: GenericArguments::empty(),
            })),
        });
        let mut analysis = AnalysisEnvironment::new(&env);
        assert!(analysis.is_recursive(recursive.id));

        let apply_infer = generic!(env, instantiate_infer(&env, 0_u32), []);
        assert!(!analysis.is_recursive(apply_infer));
    }

    #[test]
    fn distribute_union() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // If the inner type is just a single type, we should just return ourselves
        let string = generic!(env, primitive!(env, PrimitiveType::String), []);
        let mut analysis = AnalysisEnvironment::new(&env);
        assert_eq!(analysis.distribute_union(string), [string]);

        // If the inner type is distributing, we should distribute ourselves as well
        let union = generic!(
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
                generic!(env, primitive!(env, PrimitiveType::Number), []),
                generic!(env, primitive!(env, PrimitiveType::String), [])
            ]
        );
    }

    #[test]
    fn distribute_intersection() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // If the inner type is just a single type, we should just return ourselves
        let string = generic!(env, primitive!(env, PrimitiveType::String), []);
        let mut analysis = AnalysisEnvironment::new(&env);
        assert_eq!(analysis.distribute_intersection(string), [string]);

        // If the inner type is distributing, we should distribute ourselves as well
        let union = generic!(
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
                generic!(env, primitive!(env, PrimitiveType::Number), []),
                generic!(env, primitive!(env, PrimitiveType::String), [])
            ]
        );
    }

    #[test]
    fn is_subtype_of() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Apply should be transparent in is_subtype_of checks
        let integer = generic!(env, primitive!(env, PrimitiveType::Integer), []);
        let number = generic!(env, primitive!(env, PrimitiveType::Number), []);

        let mut analysis = AnalysisEnvironment::new(&env);
        assert!(analysis.is_subtype_of(integer, number));
        assert!(!analysis.is_subtype_of(number, integer));
    }

    #[test]
    fn is_equivalent() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        // Apply should be transparent in is_subtype_of checks
        let integer = generic!(env, primitive!(env, PrimitiveType::Integer), []);
        let number = generic!(env, primitive!(env, PrimitiveType::Number), []);

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
        let infer = generic!(env, instantiate_infer(&env, 0_u32), []);
        let number = generic!(env, primitive!(env, PrimitiveType::Number), []);

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

        let subtype = generic!(
            env,
            instantiate(&env, TypeKind::Never),
            [GenericArgument {
                id: GenericArgumentId::new(0),
                name: heap.intern_symbol("T"),
                constraint: Some(primitive!(env, PrimitiveType::Number))
            }]
        );

        let supertype = generic!(env, primitive!(env, PrimitiveType::String), []);

        infer.collect_constraints(subtype, supertype);

        let constraints = infer.take_constraints();
        assert_eq!(
            constraints,
            [Constraint::UpperBound {
                variable: Variable::synthetic(VariableKind::Generic(GenericArgumentId::new(0))),
                bound: primitive!(env, PrimitiveType::Number)
            }]
        );
    }

    #[test]
    fn collect_structural_constraints() {
        // Nothing should happen as they are invariant
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let mut infer = InferenceEnvironment::new(&env);

        let subtype = generic!(
            env,
            instantiate(&env, TypeKind::Never),
            [GenericArgument {
                id: GenericArgumentId::new(0),
                name: heap.intern_symbol("T"),
                constraint: Some(instantiate_infer(&env, 1_u32))
            }]
        );

        infer.collect_structural_edges(
            subtype,
            PartialStructuralEdge::Source(Variable::synthetic(VariableKind::Hole(HoleId::new(0)))),
        );

        let constraints = infer.take_constraints();
        assert_eq!(
            constraints,
            [Constraint::StructuralEdge {
                source: Variable::synthetic(VariableKind::Hole(HoleId::new(0))),
                target: Variable::synthetic(VariableKind::Hole(HoleId::new(1)))
            }]
        );
    }

    #[test]
    fn simplify_recursive() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let r#type = env.types.intern(|id| PartialType {
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Generic(Generic {
                base: id.value(),
                arguments: GenericArguments::empty(),
            })),
        });

        let mut simplify = SimplifyEnvironment::new(&env);
        let simplified = simplify.simplify(r#type.id);

        let generic = env
            .r#type(simplified)
            .kind
            .generic()
            .expect("should be generic");
        assert_eq!(generic.base, simplified);
    }

    #[test]
    fn instantiate_recursive() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);

        let r#type = env.types.intern(|id| PartialType {
            span: SpanId::SYNTHETIC,
            kind: env.intern_kind(TypeKind::Generic(Generic {
                base: id.value(),
                arguments: GenericArguments::empty(),
            })),
        });

        let mut instantiate = InstantiateEnvironment::new(&env);
        let instantiated = instantiate.instantiate(r#type.id);

        let generic = env
            .r#type(instantiated)
            .kind
            .generic()
            .expect("should be generic");
        assert_eq!(generic.base, instantiated);
    }
}
