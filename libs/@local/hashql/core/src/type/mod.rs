// HashQL type system

pub mod error;
pub mod generic_argument;
pub mod intrinsic;
pub mod opaque;
pub mod pretty_print;
pub mod primitive;
pub mod r#struct;
#[cfg(test)]
pub(crate) mod test;
pub mod tuple;
pub mod unify;
pub mod union_type;

use core::mem;

use pretty::RcDoc;

use self::{
    error::expected_never,
    generic_argument::{Param, unify_param, unify_param_lhs, unify_param_rhs},
    intrinsic::{IntrinsicType, unify_intrinsic},
    opaque::{OpaqueType, unify_opaque},
    pretty_print::{CYAN, GRAY, PrettyPrint, RED, RecursionLimit},
    primitive::{PrimitiveType, unify_primitive},
    r#struct::{StructType, unify_struct},
    tuple::{TupleType, unify_tuple},
    unify::{UnificationArena, UnificationContext, Variance},
    union_type::UnionType,
};
use crate::{arena::Arena, id::HasId, newtype, span::SpanId};

newtype!(
    pub struct TypeId(u32 is 0..=0xFFFF_FF00)
);

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ClosureType {}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum TypeKind {
    Closure(ClosureType),
    Primitive(PrimitiveType),
    Intrinsic(IntrinsicType),
    Struct(StructType),
    Tuple(TupleType),
    Opaque(OpaqueType),
    Union(UnionType),
    Param(Param),
    Never,
    Unknown,
    Infer,
    // This type is linked / the same type as another, only happens on infer chains
    Link(TypeId),
    Error,
}

impl TypeKind {
    #[must_use]
    pub const fn as_primitive(&self) -> Option<PrimitiveType> {
        match self {
            &Self::Primitive(r#type) => Some(r#type),
            _ => None,
        }
    }

    #[must_use]
    pub const fn as_intrinsic(&self) -> Option<IntrinsicType> {
        match self {
            &Self::Intrinsic(r#type) => Some(r#type),
            _ => None,
        }
    }

    #[must_use]
    pub fn into_struct(self) -> Option<StructType> {
        match self {
            Self::Struct(r#type) => Some(r#type),
            _ => None,
        }
    }

    #[must_use]
    pub fn into_tuple(self) -> Option<TupleType> {
        match self {
            Self::Tuple(r#type) => Some(r#type),
            _ => None,
        }
    }

    #[must_use]
    pub fn into_opaque(self) -> Option<OpaqueType> {
        match self {
            Self::Opaque(r#type) => Some(r#type),
            _ => None,
        }
    }
}

impl PrettyPrint for TypeKind {
    fn pretty<'a>(
        &'a self,
        arena: &'a UnificationArena,
        limit: RecursionLimit,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        match self {
            Self::Primitive(primitive) => primitive.pretty(arena, limit),
            Self::Intrinsic(intrinsic) => intrinsic.pretty(arena, limit),
            Self::Struct(r#struct) => r#struct.pretty(arena, limit),
            Self::Tuple(tuple) => tuple.pretty(arena, limit),
            Self::Opaque(opaque) => opaque.pretty(arena, limit),
            Self::Param(param) => param.pretty(arena, limit),
            Self::Never => RcDoc::text("!").annotate(CYAN),
            Self::Unknown => RcDoc::text("?").annotate(CYAN),
            Self::Infer => RcDoc::text("_").annotate(GRAY),
            Self::Link(id) => arena[*id].pretty(arena, limit),
            Self::Error => RcDoc::text("<<ERROR>>").annotate(RED),
            _ => todo!(),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Type<K = TypeKind> {
    id: TypeId,
    span: SpanId,

    kind: K,
}

impl<K> Type<K> {
    pub fn map<K2>(self, closure: impl FnOnce(K) -> K2) -> Type<K2> {
        Type {
            id: self.id,
            span: self.span,
            kind: closure(self.kind),
        }
    }

    pub const fn as_ref(&self) -> Type<&K> {
        Type {
            id: self.id,
            span: self.span,
            kind: &self.kind,
        }
    }
}

impl<K> PrettyPrint for Type<K>
where
    K: PrettyPrint,
{
    fn pretty<'a>(
        &'a self,
        arena: &'a UnificationArena,
        limit: RecursionLimit,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        self.kind.pretty(arena, limit)
    }
}

impl HasId for Type {
    type Id = TypeId;

    fn id(&self) -> Self::Id {
        self.id
    }
}

/// Unifies two types, respecting the current variance context.
///
/// In a covariant context: Ensures that `rhs` is a subtype of `lhs` (can `rhs` be used where `lhs`
/// is expected?) e.g. `rhs <: lhs`
///
/// In a contravariant context: Ensures that `lhs` is a subtype of `rhs` (can `lhs` be used where
/// `rhs` is expected?) e.g. `lhs <: rhs`
///
/// In an invariant context: Ensures that `lhs` and `rhs` are equivalent types (not just compatible)
/// e.g. `lhs <: rhs` and `rhs <: lhs`
///
/// This is the main entry point for type unification that respects variance.
pub(crate) fn unify_type(context: &mut UnificationContext, lhs: TypeId, rhs: TypeId) {
    match context.variance_context() {
        Variance::Covariant => {
            // In covariant context: can `rhs` be used where `lhs` is expected?
            unify_type_covariant(context, lhs, rhs);
        }
        Variance::Contravariant => {
            // In contravariant context: can `lhs` be used where `rhs` is expected?
            // This is implemented by swapping the arguments to the covariant function
            unify_type_covariant(context, rhs, lhs);
        }
        Variance::Invariant => {
            // In invariant context: `lhs` and `rhs` must be equivalent types
            unify_type_invariant(context, lhs, rhs);
        }
    }
}

/// Handles type unification in an invariant context, where types must be equivalent.
///
/// Invariance means that types must be identical (or structurally equivalent), not just compatible
/// in one direction.
///
/// This function implements invariance by testing compatibility in both directions:
/// - First checks if `rhs` is a subtype of `lhs` (covariant direction).
/// - If that succeeds, then checks if `lhs` is a subtype of `rhs` (contravariant direction).
/// - Only if both succeed are the types considered invariant compatible.
///
/// This approach ensures proper invariance without cloning the entire arena.
fn unify_type_invariant(context: &mut UnificationContext, lhs: TypeId, rhs: TypeId) {
    // Fast path for identical types
    if lhs == rhs {
        return;
    }

    // Keep track of diagnostics count to detect unification failures
    let old_diagnostics_len = context.diagnostics.len();

    // First check covariant compatibility: can `rhs` be used where `lhs` is expected?
    unify_type_covariant(context, lhs, rhs);

    // If the first unification failed, we're done - types aren't compatible at all
    if context.diagnostics.len() > old_diagnostics_len {
        return;
    }

    // Preserve any existing diagnostics
    let diagnostics = mem::take(&mut context.diagnostics);

    // Now check contravariant compatibility: can `lhs` be used where `rhs` is expected?
    unify_type_covariant(context, rhs, lhs);

    // Get any new diagnostics from the reverse direction check
    let new_diagnostics = mem::take(&mut context.diagnostics);
    context.diagnostics = diagnostics; // Restore original diagnostics

    // If there were errors in the reverse direction, the types are compatible
    // in one direction but not both, meaning they're not invariant
    if !new_diagnostics.is_empty() {
        let lhs_type = &context.arena[lhs];
        let rhs_type = &context.arena[rhs];

        let diagnostic = error::type_mismatch(
            context.source,
            &context.arena,
            lhs_type,
            rhs_type,
            Some(
                "These types need to be exactly the same, not just compatible. This happens in \
                 positions where exact type matching is required for type safety.",
            ),
        );

        context.record_diagnostic(diagnostic);
    }
}

/// Implements type unification in a covariant context, where `rhs` must be a subtype of `lhs`.
///
/// In a covariant context, we're answering the question: "Can a value of type `rhs` be used where
/// a value of type `lhs` is expected?" This corresponds to the normal subtyping relationship.
///
/// This function handles all the different type combinations, with special handling for:
/// - Type variables and inference variables
/// - Error propagation
/// - Primitive type subtyping
/// - Structural type compatibility (structs, tuples, etc.)
/// - Special types like Never (bottom type) and Unknown (top type)
///
/// Each match arm in this function implements the covariant subtyping rule for a specific type
/// combination.
#[expect(clippy::too_many_lines)]
fn unify_type_covariant(context: &mut UnificationContext, lhs: TypeId, rhs: TypeId) {
    if context.visit(lhs, rhs) {
        // We've detected a circular reference in the type graph
        let lhs_type = &context.arena[lhs];
        let rhs_type = &context.arena[rhs];

        let diagnostic = error::circular_type_reference(context.source, lhs_type, rhs_type);

        context.record_diagnostic(diagnostic);
        context.mark_error(lhs);
        context.mark_error(rhs);
        return;
    }

    let lhs = &context.arena[lhs];
    let rhs = &context.arena[rhs];

    let lhs_id = lhs.id;
    let rhs_id = rhs.id;

    if lhs.id == rhs.id {
        return;
    }

    // The following match arms implement the covariant subtyping rules for different type
    // combinations. In a covariant context, we're checking if `rhs` is a subtype of `lhs`
    // (`rhs <: lhs`).
    #[expect(clippy::match_same_arms, reason = "makes the intent clear")]
    match (&lhs.kind, &rhs.kind) {
        // Links are references to other types - follow them to their targets for unification
        (&TypeKind::Link(lhs_id), &TypeKind::Link(rhs_id)) => {
            // Both types are links - unify the target types
            unify_type(context, lhs_id, rhs_id);
        }
        (&TypeKind::Link(lhs_id), _) => {
            // The lhs is a link - follow it and unify with rhs
            unify_type(context, lhs_id, rhs.id);
        }
        (_, &TypeKind::Link(rhs_id)) => {
            // The rhs is a link - follow it and unify with lhs
            unify_type(context, lhs.id, rhs_id);
        }

        // Inference variables are special cases that can be refined during unification
        // Their handling is independent of variance since they represent "unknown yet" types
        (TypeKind::Infer, TypeKind::Infer) => {
            let rhs_id = rhs.id;

            // If both are inference variables, link them together so they resolve to the same type
            // This is variance-independent: inference variables are meant to be unified
            context.update_kind(lhs.id, TypeKind::Link(rhs_id));
        }
        (TypeKind::Infer, rhs) => {
            let rhs = rhs.clone();

            // The lhs is an inference variable, rhs is a concrete type
            // Inference variables are an exception to the "no modifications" rule
            // They are specifically designed to be refined during type checking
            context.update_kind(lhs.id, rhs);
        }
        (lhs, TypeKind::Infer) => {
            let lhs = lhs.clone();

            // The lhs is a concrete type, rhs is an inference variable
            // Inference variables are an exception to the "no modifications" rule
            // They are specifically designed to be refined during type checking
            context.update_kind(rhs.id, lhs);
        }

        // Error types represent invalid or erroneous types
        (TypeKind::Error, TypeKind::Error) => {
            // Both types are errors - they're considered compatible
            // This prevents cascading errors
        }
        (TypeKind::Error, _) => {
            // The lhs is an error - propagate the error to rhs
            // This ensures errors flow through the type system
            context.mark_error(rhs.id);
        }
        (_, TypeKind::Error) => {
            // The rhs is an error - propagate the error to lhs
            // This ensures errors flow through the type system
            context.mark_error(lhs.id);
        }

        (&TypeKind::Primitive(lhs_kind), &TypeKind::Primitive(rhs_kind)) => {
            unify_primitive(
                context,
                lhs.as_ref().map(|_| lhs_kind),
                rhs.as_ref().map(|_| rhs_kind),
            );
        }

        (&TypeKind::Intrinsic(lhs_kind), &TypeKind::Intrinsic(rhs_kind)) => {
            unify_intrinsic(
                context,
                lhs.as_ref().map(|_| lhs_kind),
                rhs.as_ref().map(|_| rhs_kind),
            );
        }

        (TypeKind::Struct(lhs_kind), TypeKind::Struct(rhs_kind)) => {
            unify_struct(
                context,
                &lhs.as_ref().map(|_| lhs_kind.clone()),
                &rhs.as_ref().map(|_| rhs_kind.clone()),
            );
        }

        (TypeKind::Tuple(lhs_kind), TypeKind::Tuple(rhs_kind)) => {
            unify_tuple(
                context,
                &lhs.as_ref().map(|_| lhs_kind.clone()),
                &rhs.as_ref().map(|_| rhs_kind.clone()),
            );
        }

        (TypeKind::Opaque(lhs_kind), TypeKind::Opaque(rhs_kind)) => {
            unify_opaque(
                context,
                &lhs.as_ref().map(|_| lhs_kind.clone()),
                &rhs.as_ref().map(|_| rhs_kind.clone()),
            );
        }

        (TypeKind::Param(lhs_kind), TypeKind::Param(rhs_kind)) => {
            unify_param(
                context,
                &lhs.as_ref().map(|_| lhs_kind.clone()),
                &rhs.as_ref().map(|_| rhs_kind.clone()),
            );
        }
        (TypeKind::Param(lhs_kind), _) => {
            unify_param_lhs(context, &lhs.as_ref().map(|_| lhs_kind.clone()), rhs_id);
        }
        (_, TypeKind::Param(rhs_kind)) => {
            unify_param_rhs(context, lhs_id, &rhs.as_ref().map(|_| rhs_kind.clone()));
        }

        // Never is the bottom type - it's a subtype of all other types
        (TypeKind::Never, TypeKind::Never) => {
            // Both types are Never - they're compatible
            // This is true in any variance context
        }
        (TypeKind::Never, _) => {
            // In covariant context: Never (lhs) is a subtype of any type (rhs).
            // This is always valid - a value of Never type can be used anywhere
            // We preserve the Never type on the lhs because it's more specific than any other type
            // No modification needed - Never remains Never
        }
        (_, TypeKind::Never) => {
            // In covariant context: A concrete type (lhs) is not a supertype of Never (rhs)
            // This is an error - we expected lhs but got a Never
            let diagnostic = expected_never(rhs.span, &context.arena, lhs);

            // Mark as error since the types are incompatible
            context.mark_error(lhs.id);

            context.record_diagnostic(diagnostic);
        }

        // Unknown is the top type - all other types are subtypes of it
        (TypeKind::Unknown, TypeKind::Unknown) => {
            // Both types are Unknown - they're compatible
            // This is true in any variance context
        }
        (TypeKind::Unknown, rhs) => {
            // In covariant context: Unknown (lhs) is a supertype of any type (rhs).
            // This is always valid - any value can be used where Unknown is expected.
            // Even in a strictly variance-aware system, updating Unknown to a more precise type
            // is beneficial for type inference and error reporting.
            // The compatibility check succeeds due to variance, but we also update for precision
            let rhs = rhs.clone();
            context.update_kind(lhs_id, rhs);
        }
        (_, TypeKind::Unknown) => {
            // In covariant context: A concrete type (lhs) is not a subtype of Unknown (rhs)
            // This is an error - we expected a specific type but got an Unknown
            let diagnostic = error::type_mismatch(
                context.source,
                &context.arena,
                lhs,
                rhs,
                Some(
                    "Expected a specific type, but got an 'Unknown' value. This happens when the \
                     type checker cannot determine a more specific type.",
                ),
            );

            context.record_diagnostic(diagnostic);
            context.mark_error(rhs_id);
        }

        // Fallback case for any type combination not handled by the above cases
        _ => {
            // In covariant context: These types are not in a subtyping relationship
            // Provide specific help messages for common cases
            let help_message = match (&lhs.kind, &rhs.kind) {
                (TypeKind::Opaque(_), _) | (_, TypeKind::Opaque(_)) => {
                    // Special case for opaque types mixed with other types
                    // Opaque types use nominal typing rather than structural typing
                    "Cannot mix nominal types (Opaque) with structural types. Opaque types only \
                     unify with other opaque types of the same name."
                }
                _ => "These types are fundamentally incompatible and cannot be unified",
            };

            let diagnostic =
                error::type_mismatch(context.source, &context.arena, lhs, rhs, Some(help_message));

            context.record_diagnostic(diagnostic);
            context.mark_error(lhs_id);
            context.mark_error(rhs_id);
        }
    }

    context.leave(lhs_id, rhs_id);
}
