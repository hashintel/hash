pub mod apply;
pub mod param;

use core::{
    fmt::{self, Display},
    hash::Hash,
    ops::Deref,
};

pub use self::{
    apply::{Apply, GenericSubstitution, GenericSubstitutions},
    param::Param,
};
use super::TypeKind;
use crate::{
    collections::{SmallVec, TinyVec},
    id::newtype,
    intern::Interned,
    newtype_collections, newtype_producer,
    pretty::display::DisplayBuilder,
    span::SpanId,
    symbol::{Ident, Symbol},
    r#type::{
        PartialType, Type, TypeId,
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment, Variance,
            instantiate::{ArgumentsState, InstantiateEnvironment},
        },
        inference::Inference,
        lattice::{Lattice, Projection, Subscript},
    },
};

newtype!(
    #[id(crate = crate)]
    pub struct GenericArgumentId(u32 is 0..=0xFFFF_FF00)
);

newtype_producer!(pub struct GenericArgumentIdProducer(GenericArgumentId));

newtype_collections!(pub type GenericArgument* from GenericArgumentId);

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

    #[must_use]
    pub fn display(references: &[Self]) -> impl Display {
        DisplayBuilder::new(references.iter().map(|reference| reference.name.demangle()))
            .separated(", ")
            .delimited("<", ">")
    }

    #[must_use]
    pub fn display_mangled(references: &[Self]) -> impl Display {
        DisplayBuilder::new(
            references
                .iter()
                .map(|GenericArgumentReference { id, name }| {
                    fmt::from_fn(|fmt| {
                        Display::fmt(name, fmt)?;
                        fmt.write_str("?")?;
                        Display::fmt(id, fmt)
                    })
                }),
        )
        .separated(", ")
        .delimited("<", ">")
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

    fn subscript(
        self: Type<'heap, Self>,
        index: TypeId,
        env: &mut LatticeEnvironment<'_, 'heap>,
        infer: &mut InferenceEnvironment<'_, 'heap>,
    ) -> Subscript {
        env.subscript(self.kind.base, index, infer)
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
            return smallvec::SmallVec::from_slice_copy(&[self.id]);
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
            return smallvec::SmallVec::from_slice_copy(&[self.id]);
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
        env.is_subtype_of(Variance::Covariant, self.kind.base, supertype.kind.base)
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
    /// Collect constraints for all generic arguments.
    ///
    /// `rigid` must be `true` while **checking the body** of a generic item (closure). In that
    /// phase we:
    ///
    /// 1. Emit an *invariant* constraint `param == BoundOrUnknown`. This turns the parameter into a
    ///    **rigid, definition-time placeholder** (α-renamed, cannot unify with anything). This
    ///    rigid placeholder is also known in type-theory literature as a *skolem type*.
    ///
    /// 2. Emit the usual *covariant* constraint `param <: Bound` so the body may rely on the
    ///    declared bound.
    ///
    /// After the body is type-checked we *generalise* over those rigid placeholders. Because
    /// generalisation introduces fresh type variables at every call-site, the equality
    /// constraint disappears from the public type and callers may still instantiate the
    /// parameter with any `U <: Bound`.
    ///
    /// When `rigid == false` (i.e. at call-sites) we collect **only** the
    /// covariant `param <: Bound`; the parameter remains an ordinary
    /// unification variable.
    pub fn collect_argument_constraints(
        self,
        span: SpanId,
        env: &mut InferenceEnvironment<'_, 'heap>,
        rigid: bool,
    ) {
        for &argument in &*self.arguments {
            let constraint = match argument.constraint {
                Some(constraint) => constraint,
                None if rigid => env.intern_type(PartialType {
                    span,
                    kind: env.intern_kind(TypeKind::Unknown),
                }),
                None => continue,
            };

            let param = env.intern_type(PartialType {
                span,
                kind: env.intern_kind(TypeKind::Param(Param {
                    argument: argument.id,
                })),
            });

            // If the type is rigid e.g. a skolem type, we additionally discharge an equality
            // constraint between the parameter and the argument
            if rigid {
                env.collect_constraints(Variance::Invariant, param, constraint);
            }

            // if `T: Number`, than `T <: Number`.
            env.collect_constraints(Variance::Covariant, param, constraint);
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
        self.kind
            .collect_argument_constraints(self.span, env, false);
        supertype
            .kind
            .collect_argument_constraints(supertype.span, env, false);

        env.collect_constraints(Variance::Covariant, self.kind.base, supertype.kind.base);
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
