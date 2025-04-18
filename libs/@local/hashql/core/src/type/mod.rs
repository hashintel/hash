// HashQL type system

pub mod environment;
pub mod error;
pub mod intern;
pub mod kind;
pub mod lattice;
pub mod pretty_print;
pub(crate) mod recursion;
#[cfg(test)]
pub(crate) mod test;

use core::ops::Receiver;

use self::{kind::TypeKind, pretty_print::PrettyPrint, recursion::RecursionDepthBoundary};
use crate::{id::HasId, newtype, span::SpanId};

// TODO: consider interning types to reduce memory usage
// TODO: see https://github.com/rust-lang/rust/blob/94015d3cd4b48d098abd0f3e44af97dab2b713b4/compiler/rustc_data_structures/src/intern.rs#L26 and https://github.com/rust-lang/rust/blob/94015d3cd4b48d098abd0f3e44af97dab2b713b4/compiler/rustc_data_structures/src/sharded.rs#L204

newtype!(
    pub struct TypeId(u32 is 0..=0xFFFF_FF00)
);

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct Type<'heap, K: ?Sized = TypeKind<'heap>> {
    id: TypeId,
    span: SpanId,

    kind: &'heap K,
}

impl<'heap, K> Copy for Type<'heap, K> {}
impl<'heap, K> Clone for Type<'heap, K> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<'heap, K> Type<'heap, K> {
    pub fn map<K2>(self, closure: impl FnOnce(&'heap K) -> &'heap K2) -> Type<'heap, K2> {
        Type {
            id: self.id,
            span: self.span,
            kind: closure(self.kind),
        }
    }
}

impl<K> PrettyPrint for Type<'_, K>
where
    K: PrettyPrint,
{
    fn pretty<'env>(
        &self,
        env: &'env environment::Environment,
        limit: RecursionDepthBoundary,
    ) -> pretty::RcDoc<'env, anstyle::Style> {
        self.kind.pretty(env, limit)
    }
}

impl<K> HasId for Type<'_, K> {
    type Id = TypeId;

    fn id(&self) -> Self::Id {
        self.id
    }
}

impl<K: ?Sized> Receiver for Type<'_, K> {
    type Target = K;
}

// /// Unifies two types, respecting the current variance context.
// ///
// /// In a covariant context: Ensures that `rhs` is a subtype of `lhs` (can `rhs` be used where
// `lhs` /// is expected?) e.g. `rhs <: lhs`
// ///
// /// In a contravariant context: Ensures that `lhs` is a subtype of `rhs` (can `lhs` be used where
// /// `rhs` is expected?) e.g. `lhs <: rhs`
// ///
// /// In an invariant context: Ensures that `lhs` and `rhs` are equivalent types (not just
// compatible) /// e.g. `lhs <: rhs` and `rhs <: lhs`
// ///
// /// This is the main entry point for type unification that respects variance.
// fn unify_type_impl(env: &mut UnificationEnvironment, lhs: TypeId, rhs: TypeId) {
//     match env.variance {
//         Variance::Covariant => {
//             // In covariant context: can `rhs` be used where `lhs` is expected?
//             unify_type_covariant(env, lhs, rhs);
//         }
//         Variance::Contravariant => {
//             // In contravariant context: can `lhs` be used where `rhs` is expected?
//             // This is implemented by swapping the arguments to the covariant function
//             unify_type_covariant(env, rhs, lhs);
//         }
//         Variance::Invariant => {
//             // In invariant context: `lhs` and `rhs` must be equivalent types
//             unify_type_invariant(env, lhs, rhs);
//         }
//     }
// }

// /// Handles type unification in an invariant context, where types must be equivalent.
// ///
// /// Invariance means that types must be identical (or structurally equivalent), not just
// compatible /// in one direction.
// ///
// /// This function implements invariance by testing compatibility in both directions:
// /// - First checks if `rhs` is a subtype of `lhs` (covariant direction).
// /// - If that succeeds, then checks if `lhs` is a subtype of `rhs` (contravariant direction).
// /// - Only if both succeed are the types considered invariant compatible.
// ///
// /// This approach ensures proper invariance without cloning the entire arena.
// fn unify_type_invariant(env: &mut UnificationEnvironment, lhs: TypeId, rhs: TypeId) {
//     // Fast path for identical types
//     if lhs == rhs {
//         return;
//     }

//     // Keep track of diagnostics count to detect unification failures
//     let old_diagnostics_len = env.diagnostics.fatal();

//     // First check covariant compatibility: can `rhs` be used where `lhs` is expected?
//     unify_type_covariant(env, lhs, rhs);

//     // If the first unification failed, we're done - types aren't compatible at all
//     if env.diagnostics.fatal() > old_diagnostics_len {
//         return;
//     }

//     // Preserve any existing diagnostics
//     let diagnostics = env.diagnostics.take();

//     // Now check contravariant compatibility: can `lhs` be used where `rhs` is expected?
//     unify_type_covariant(env, rhs, lhs);

//     // Get any new diagnostics from the reverse direction check
//     let new_diagnostics = env.diagnostics.take();
//     env.diagnostics.replace(diagnostics);

//     // If there were errors in the reverse direction, the types are compatible
//     // in one direction but not both, meaning they're not invariant
//     if !new_diagnostics.is_empty() {
//         let lhs_type = env.types[lhs].copied();
//         let rhs_type = env.types[rhs].copied();

//         let diagnostic = error::type_mismatch(
//             env,
//             lhs_type,
//             rhs_type,
//             Some(
//                 "These types need to be exactly the same, not just compatible. This happens in \
//                  positions where exact type matching is required for type safety.",
//             ),
//         );

//         env.diagnostics.push(diagnostic);
//     }
// }

// /// Implements type unification in a covariant context, where `rhs` must be a subtype of `lhs`.
// ///
// /// In a covariant context, we're answering the question: "Can a value of type `rhs` be used
// where /// a value of type `lhs` is expected?" This corresponds to the normal subtyping
// relationship. ///
// /// This function handles all the different type combinations, with special handling for:
// /// - Type variables and inference variables
// /// - Error propagation
// /// - Primitive type subtyping
// /// - Structural type compatibility (structs, tuples, etc.)
// /// - Special types like Never (bottom type) and Unknown (top type)
// ///
// /// Each match arm in this function implements the covariant subtyping rule for a specific type
// /// combination.
// #[expect(clippy::too_many_lines)]
// fn unify_type_covariant(env: &mut UnificationEnvironment, lhs: TypeId, rhs: TypeId) {
//     let lhs = env.types[lhs].copied();
//     let rhs = env.types[rhs].copied();

//     let lhs_id = lhs.id;
//     let rhs_id = rhs.id;

//     if lhs.id == rhs.id {
//         return;
//     }

//     // The following match arms implement the covariant subtyping rules for different type
//     // combinations. In a covariant context, we're checking if `rhs` is a subtype of `lhs`
//     // (`rhs <: lhs`).
//     #[expect(clippy::match_same_arms, reason = "makes the intent clear")]
//     match (lhs.kind, rhs.kind) {
//         // TODO: for infer we need to actually get the type
//         // Inference variables are special cases that can be refined during unification
//         // Their handling is independent of variance since they represent "unknown yet" types
//         (TypeKind::Infer, TypeKind::Infer) => {
//             // If both are inference variables, link them together so they resolve to the same
// type             // This is variance-independent: inference variables are meant to be unified
//             env.update_kind(lhs_id, TypeKind::Link(rhs_id));
//         }
//         (TypeKind::Infer, rhs) => {
//             // The lhs is an inference variable, rhs is a concrete type
//             // Inference variables are an exception to the "no modifications" rule
//             // They are specifically designed to be refined during type checking
//             let rhs = rhs.clone();
//             env.update_kind(lhs_id, rhs);
//         }
//         (lhs, TypeKind::Infer) => {
//             // The lhs is a concrete type, rhs is an inference variable
//             // Inference variables are an exception to the "no modifications" rule
//             // They are specifically designed to be refined during type checking
//             let lhs = lhs.clone();
//             env.update_kind(rhs_id, lhs);
//         }

//         (TypeKind::Closure(lhs_kind), TypeKind::Closure(rhs_kind)) => {
//             unify_closure(
//                 env,
//                 &lhs.as_ref().map(|_| lhs_kind.clone()),
//                 &rhs.as_ref().map(|_| rhs_kind.clone()),
//             );
//         }

//         (&TypeKind::Primitive(lhs_kind), &TypeKind::Primitive(rhs_kind)) => {
//             unify_primitive(
//                 env,
//                 lhs.as_ref().map(|_| lhs_kind),
//                 rhs.as_ref().map(|_| rhs_kind),
//             );
//         }

//         (&TypeKind::Intrinsic(lhs_kind), &TypeKind::Intrinsic(rhs_kind)) => {
//             unify_intrinsic(
//                 env,
//                 lhs.as_ref().map(|_| lhs_kind),
//                 rhs.as_ref().map(|_| rhs_kind),
//             );
//         }

//         (TypeKind::Struct(lhs_kind), TypeKind::Struct(rhs_kind)) => {
//             unify_struct(
//                 env,
//                 &lhs.as_ref().map(|_| lhs_kind.clone()),
//                 &rhs.as_ref().map(|_| rhs_kind.clone()),
//             );
//         }

//         (TypeKind::Tuple(lhs_kind), TypeKind::Tuple(rhs_kind)) => {
//             unify_tuple(
//                 env,
//                 &lhs.as_ref().map(|_| lhs_kind.clone()),
//                 &rhs.as_ref().map(|_| rhs_kind.clone()),
//             );
//         }

//         (TypeKind::Opaque(lhs_kind), TypeKind::Opaque(rhs_kind)) => {
//             unify_opaque(
//                 env,
//                 &lhs.as_ref().map(|_| lhs_kind.clone()),
//                 &rhs.as_ref().map(|_| rhs_kind.clone()),
//             );
//         }

//         (TypeKind::Param(lhs_kind), TypeKind::Param(rhs_kind)) => {
//             unify_param(
//                 env,
//                 &lhs.as_ref().map(|_| lhs_kind.clone()),
//                 &rhs.as_ref().map(|_| rhs_kind.clone()),
//             );
//         }
//         (TypeKind::Param(lhs_kind), _) => {
//             unify_param_lhs(env, &lhs.as_ref().map(|_| lhs_kind.clone()), rhs_id);
//         }
//         (_, TypeKind::Param(rhs_kind)) => {
//             unify_param_rhs(env, lhs_id, &rhs.as_ref().map(|_| rhs_kind.clone()));
//         }

//         (TypeKind::Union(lhs_kind), TypeKind::Union(rhs_kind)) => {
//             unify_union(
//                 env,
//                 &lhs.as_ref().map(|_| lhs_kind.clone()),
//                 &rhs.as_ref().map(|_| rhs_kind.clone()),
//             );
//         }
//         (TypeKind::Union(lhs_kind), _) => {
//             unify_union_lhs(env, &lhs.as_ref().map(|_| lhs_kind.clone()), &rhs.clone());
//         }
//         (_, TypeKind::Union(rhs_kind)) => {
//             unify_union_rhs(env, &lhs.clone(), &rhs.as_ref().map(|_| rhs_kind.clone()));
//         }

//         // Unknown is the top type - all other types are subtypes of it
//         (TypeKind::Unknown, TypeKind::Unknown) => {
//             // Both types are Unknown - they're compatible
//             // This is true in any variance context
//         }
//         (TypeKind::Unknown, _) => {
//             // In covariant context: Unknown (lhs) is a supertype of any type (rhs).
//             // This is always valid - any value can be used where Unknown is expected.
//             // We do not narrow the type because that would potentially create a false-positive
// type             // mismatch down the line.
//         }
//         (_, TypeKind::Unknown) => {
//             // In covariant context: A concrete type (lhs) is not a subtype of Unknown (rhs)
//             // This is an error - we expected a specific type but got an Unknown
//             let diagnostic = error::type_mismatch(
//                 env,
//                 lhs,
//                 rhs,
//                 Some(
//                     "Expected a specific type, but got an 'Unknown' value. This happens when the
// \                      type checker cannot determine a more specific type.",
//                 ),
//             );

//             env.diagnostics.push(diagnostic);
//         }

//         // Never is the bottom type - it's a subtype of all other types
//         (TypeKind::Never, TypeKind::Never) => {
//             // Both types are Never - they're compatible
//             // This is true in any variance context
//         }
//         (TypeKind::Never, _) => {
//             // In covariant context: Never (lhs) is a subtype of any type (rhs).
//             // This is always valid - a value of Never type can be used anywhere
//             // We preserve the Never type on the lhs because it's more specific than any other
// type             // No modification needed - Never remains Never
//         }
//         (_, TypeKind::Never) => {
//             // In covariant context: A concrete type (lhs) is not a supertype of Never (rhs)
//             // This is an error - we expected lhs but got a Never
//             let diagnostic = expected_never(env, lhs);

//             env.diagnostics.push(diagnostic);
//         }

//         // Fallback case for any type combination not handled by the above cases
//         _ => {
//             // In covariant context: These types are not in a subtyping relationship
//             // Provide specific help messages for common cases
//             let help_message = match (&lhs.kind, &rhs.kind) {
//                 (TypeKind::Opaque(_), _) | (_, TypeKind::Opaque(_)) => {
//                     // Special case for opaque types mixed with other types
//                     // Opaque types use nominal typing rather than structural typing
//                     "Cannot mix nominal types (Opaque) with structural types. Opaque types only \
//                      unify with other opaque types of the same name."
//                 }
//                 _ => "These types are fundamentally incompatible and cannot be unified",
//             };

//             let diagnostic = type_mismatch(env, lhs, rhs, Some(help_message));

//             env.diagnostics.push(diagnostic);
//         }
//     }
// }

// /// Computes the intersection of two types
// ///
// /// The intersection type contains all constraints from both types:
// /// - For structs: combines all fields, with common fields having their types intersected.
// /// - For primitives: follows subtyping relationships (e.g., Integer ∩ Number = Integer).
// /// - For unions: applies the distribution rule (A | B) ∩ (C | D) = (A ∩ C)|(A ∩ D)|(B ∩ C)|(B ∩
// D). /// - For generic parameters (Param):
// ///   - Same parameter (e.g., T ∩ T): Returns the parameter itself.
// ///   - Different parameters (e.g., T ∩ U): Currently results in Never, in the future, if
// required ///     this could represent a constrained type satisfying both.
// /// - For inference variables (Infer):
// ///   - Infer ∩ T = T (inference variables are refined to the other type).
// ///   - Infer ∩ Infer = Infer (two inference variables intersect to an inference variable).
// /// - Special cases:
// ///   - T ∩ T = T (identical types)
// ///   - Never ∩ T = Never (bottom type property)
// ///   - Unknown ∩ T = T (top type property)
// ///
// /// Note that intersections for the following types are not implemented as they're not deemed
// /// meaningful:
// /// - Closures
// /// - Opaque types (nominal types)
// /// - Intrinsics (which are just opaque internal types)
// ///
// /// # Returns
// ///
// /// The type ID of the intersection result.
// pub fn intersection_type(env: &mut UnificationEnvironment, lhs: TypeId, rhs: TypeId) -> TypeId {
//     // TODO: H-4383 make intersection types a first class citizen

//     let Some(id) = intersection_type_impl(env, lhs, rhs) else {
//         let lhs_type = env.arena[lhs].clone();
//         let rhs_type = env.arena[rhs].clone();

//         let reason = match (&lhs_type.kind, &rhs_type.kind) {
//             (TypeKind::Param(_), TypeKind::Param(_)) => {
//                 "Different generic type parameters have an empty intersection."
//             }
//             (TypeKind::Primitive(_), TypeKind::Primitive(_)) => {
//                 "These primitive types are incompatible and have no common values."
//             }
//             _ => "These types are incompatible and have no common values.",
//         };

//         let diagnostic = intersection_coerced_to_never(env, &lhs_type, &rhs_type, reason);
//         env.record_diagnostic(diagnostic);

//         return env.arena.push_with(|id| Type {
//             id,
//             span: lhs_type.span,
//             kind: TypeKind::Never,
//         });
//     };

//     id
// }

// // Optimized version of `intersection_type`, that does not allocate a new type for `Never`
// pub(crate) fn intersection_type_impl(
//     env: &mut UnificationEnvironment,
//     lhs: TypeId,
//     rhs: TypeId,
// ) -> Option<TypeId> {
//     // Fast path: if the types are identical, no changes needed
//     if lhs == rhs {
//         return Some(lhs);
//     }

//     if env.structurally_equivalent(lhs, rhs) {
//         return Some(lhs);
//     }

//     let lhs_type = env.arena[lhs].clone();
//     let rhs_type = env.arena[rhs].clone();

//     let kind = match (&lhs_type.kind, &rhs_type.kind) {
//         (&TypeKind::Link(lhs), &TypeKind::Link(rhs)) => {
//             return intersection_type_impl(env, lhs, rhs);
//         }
//         (&TypeKind::Link(lhs), _) => {
//             return intersection_type_impl(env, lhs, rhs);
//         }
//         (_, &TypeKind::Link(rhs)) => {
//             return intersection_type_impl(env, lhs, rhs);
//         }

//         (TypeKind::Infer, rhs) => {
//             // Inference variable should be set to the other type
//             // This follows the same pattern as unification
//             rhs.clone()
//         }
//         (lhs, TypeKind::Infer) => {
//             // Inference variable should be set to the other type
//             // This follows the same pattern as unification
//             lhs.clone()
//         }

//         // Struct intersection: combine fields from both structs
//         (TypeKind::Struct(lhs_struct), TypeKind::Struct(rhs_struct)) => {
//             TypeKind::Struct(intersection_struct(env, lhs_struct, rhs_struct))
//         }

//         // Primitive intersection, relevant for subtyping relationships
//         (&TypeKind::Primitive(lhs), &TypeKind::Primitive(rhs)) => {
//             TypeKind::Primitive(intersection_primitive(lhs, rhs)?)
//         }

//         // Union intersection: distribute intersection across variants
//         (TypeKind::Union(lhs_union), TypeKind::Union(rhs_union)) => {
//             let union = intersection_union(env, lhs_union, rhs_union);

//             if union.variants.is_empty() {
//                 return None;
//             } else if union.variants.len() == 1 {
//                 // If there's only one variant, use its kind directly
//                 env.arena[union.variants[0]].kind.clone()
//             } else {
//                 TypeKind::Union(union)
//             }
//         }

//         // Intersection with a union: distribute the intersection
//         (TypeKind::Union(lhs_union), _) => {
//             let union = intersection_with_union(env, rhs, lhs_union);

//             if union.variants.is_empty() {
//                 return None;
//             } else if union.variants.len() == 1 {
//                 // If there's only one variant, use its kind directly
//                 env.arena[union.variants[0]].kind.clone()
//             } else {
//                 TypeKind::Union(union)
//             }
//         }
//         (_, TypeKind::Union(rhs_union)) => {
//             let union = intersection_with_union(env, lhs, rhs_union);

//             if union.variants.is_empty() {
//                 return None;
//             } else if union.variants.len() == 1 {
//                 // If there's only one variant, use its kind directly
//                 env.arena[union.variants[0]].kind.clone()
//             } else {
//                 TypeKind::Union(union)
//             }
//         }

//         // Special cases for Never and Unknown
//         (&TypeKind::Never, _) | (_, &TypeKind::Never) => {
//             // Intersection with Never is always Never
//             return None;
//         }
//         (&TypeKind::Unknown, _) => {
//             // Unknown ∩ T = T
//             rhs_type.kind.clone()
//         }
//         (_, &TypeKind::Unknown) => {
//             // T ∩ Unknown = T (no change needed)
//             lhs_type.kind.clone()
//         }

//         // Default case: types are incompatible, intersection is Never
//         _ => return None,
//     };

//     Some(env.arena.push_with(|id| Type {
//         id,
//         span: lhs_type.span,
//         kind,
//     }))
// }
