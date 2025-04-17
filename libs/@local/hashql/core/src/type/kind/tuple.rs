use core::ops::Index;

use ecow::EcoVec;
use pretty::RcDoc;
use smallvec::SmallVec;

use super::{TypeKind, generic_argument::GenericArguments};
use crate::r#type::{
    Type, TypeId,
    environment::{
        EquivalenceEnvironment, LatticeEnvironment, SimplifyEnvironment, TypeAnalysisEnvironment,
        UnificationEnvironment,
    },
    error::tuple_length_mismatch,
    lattice::Lattice,
    pretty_print::PrettyPrint,
    recursion::RecursionDepthBoundary,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TupleType {
    pub fields: EcoVec<TypeId>,

    pub arguments: GenericArguments,
}

impl TupleType {
    pub(crate) fn structurally_equivalent(
        &self,
        other: &Self,
        env: &mut EquivalenceEnvironment,
    ) -> bool {
        self.fields.len() == other.fields.len()
            && self
                .fields
                .iter()
                .zip(other.fields.iter())
                .all(|(&lhs, &rhs)| env.semantically_equivalent(lhs, rhs))
            && self
                .arguments
                .semantically_equivalent(&other.arguments, env)
    }
}

impl Lattice for TupleType {
    fn join(
        self: Type<&Self>,
        other: Type<&Self>,
        env: &mut LatticeEnvironment,
    ) -> SmallVec<TypeId, 4> {
        if self.kind.fields.len() != other.kind.fields.len() {
            return SmallVec::from_slice(&[self.id, other.id]);
        }

        // TODO: we need to join put the arguments into scope

        // join pointwise
        let mut fields = EcoVec::with_capacity(self.kind.fields.len());
        for (&lhs, &rhs) in self.kind.fields.iter().zip(other.kind.fields.iter()) {
            fields.push(env.join(lhs, rhs));
        }

        // Check if we can opt-out into allocating a new type
        if fields == self.kind.fields {
            return SmallVec::from_slice(&[self.id]);
        }

        if fields == other.kind.fields {
            return SmallVec::from_slice(&[other.id]);
        }

        // ... we can't so we need to allocate a new type
        // merge the two arguments together, as some of the fields may refer to either
        let mut arguments = self.kind.arguments.clone();
        arguments.merge(other.kind.arguments.clone());

        let id = env.arena.push_with(|id| Type {
            id,
            span: self.span,
            kind: TypeKind::Tuple(Self { fields, arguments }),
        });

        SmallVec::from_slice(&[id])
    }

    fn meet(
        self: Type<&Self>,
        other: Type<&Self>,
        env: &mut LatticeEnvironment,
    ) -> SmallVec<TypeId, 4> {
        if self.kind.fields.len() != other.kind.fields.len() {
            return SmallVec::new();
        }

        // TODO: we need to join put the arguments into scope

        // meet pointwise
        let mut fields = EcoVec::with_capacity(self.kind.fields.len());
        for (&lhs, &rhs) in self.kind.fields.iter().zip(other.kind.fields.iter()) {
            fields.push(env.meet(lhs, rhs));
        }

        // Check if we can opt-out into allocating a new type
        if fields == self.kind.fields {
            return SmallVec::from_slice(&[self.id]);
        }

        if fields == other.kind.fields {
            return SmallVec::from_slice(&[other.id]);
        }

        // ... we can't so we need to allocate a new type
        // merge the two arguments together, as some of the fields may refer to either
        let mut arguments = self.kind.arguments.clone();
        arguments.merge(other.kind.arguments.clone());

        let id = env.arena.push_with(|id| Type {
            id,
            span: self.span,
            kind: TypeKind::Tuple(Self { fields, arguments }),
        });

        SmallVec::from_slice(&[id])
    }

    fn uninhabited(self: Type<&Self>, env: &mut TypeAnalysisEnvironment) -> bool {
        // uninhabited if any of the fields are uninhabited
        self.kind.fields.iter().any(|&field| env.uninhabited(field))
    }

    fn semantically_equivalent(
        self: Type<&Self>,
        other: Type<&Self>,
        env: &mut EquivalenceEnvironment,
    ) -> bool {
        self.kind.fields.len() == other.kind.fields.len()
            && self
                .kind
                .fields
                .iter()
                .zip(other.kind.fields.iter())
                .all(|(&lhs, &rhs)| env.semantically_equivalent(lhs, rhs))
            && self
                .kind
                .arguments
                .semantically_equivalent(&other.kind.arguments, env)
    }

    /// Unifies tuple types
    ///
    /// In a covariant context:
    /// - Both tuples must have the same number of fields (tuples are invariant in length)
    /// - Each corresponding field must be covariant
    fn unify(self: Type<&Self>, other: Type<&Self>, env: &mut UnificationEnvironment) {
        // Tuples must have the same number of fields
        if self.kind.fields.len() != other.kind.fields.len() {
            let diagnostic = tuple_length_mismatch(
                env.source,
                &self,
                &other,
                self.kind.fields.len(),
                other.kind.fields.len(),
            );

            env.record_diagnostic(diagnostic);

            return;
        }

        // Enter generic argument scope for both tuples
        self.kind.arguments.enter_scope(env);
        other.kind.arguments.enter_scope(env);

        // Unify corresponding fields in each tuple
        for (&lhs_field, &rhs_field) in self.kind.fields.iter().zip(other.kind.fields.iter()) {
            // Fields are covariant
            env.in_covariant(|env| {
                env.unify_type(lhs_field, rhs_field);
            });
        }

        // Exit generic argument scope
        self.kind.arguments.exit_scope(env);
        other.kind.arguments.exit_scope(env);
    }

    fn simplify(self: Type<&Self>, env: &mut SimplifyEnvironment) -> TypeId {
        let mut fields = EcoVec::with_capacity(self.kind.fields.len());

        for &field in &self.kind.fields {
            fields.push(env.simplify(field));
        }

        // Check if we can opt-out into having to allocate a new type
        if fields.len() == self.kind.fields.len() {
            return self.id;
        }

        // ... we can't so we need to allocate a new type
        env.arena.push_with(|id| Type {
            id,
            span: self.span,
            kind: TypeKind::Tuple(Self {
                fields,
                arguments: self.kind.arguments.clone(),
            }),
        })
    }
}

impl PrettyPrint for TupleType {
    fn pretty<'a>(
        &'a self,
        arena: &'a impl Index<TypeId, Output = Type>,
        limit: RecursionDepthBoundary,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        let inner = if self.fields.is_empty() {
            RcDoc::text("()")
        } else if self.fields.len() == 1 {
            RcDoc::text("(")
                .append(limit.pretty(&arena[self.fields[0]], arena))
                .append(RcDoc::text(",)"))
        } else {
            RcDoc::text("(")
                .append(
                    RcDoc::intersperse(
                        self.fields
                            .iter()
                            .map(|&field| limit.pretty(&arena[field], arena)),
                        RcDoc::text(",").append(RcDoc::line()),
                    )
                    .nest(1)
                    .group(),
                )
                .append(RcDoc::text(")"))
        };

        self.arguments.pretty(arena, limit).append(inner).group()
    }
}

/// Unifies tuple types
///
/// In a covariant context:
/// - Both tuples must have the same number of fields (tuples are invariant in length)
/// - Each corresponding field must be covariant
pub(crate) fn unify_tuple(
    _: &mut UnificationEnvironment,
    _: &Type<TupleType>,
    _: &Type<TupleType>,
) {
    unimplemented!("use Lattice::join instead")
}
