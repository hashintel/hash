use core::ops::Index;

use ecow::EcoVec;
use pretty::RcDoc;

use super::TypeKind;
use crate::r#type::{
    Type, TypeId,
    environment::{EquivalenceEnvironment, UnificationEnvironment},
    error::union_variant_mismatch,
    intersection_type_impl,
    pretty_print::PrettyPrint,
    recursion::RecursionDepthBoundary,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct UnionType {
    pub variants: EcoVec<TypeId>,
}

impl UnionType {
    pub(crate) fn structurally_equivalent(
        &self,
        other: &Self,
        env: &mut EquivalenceEnvironment,
    ) -> bool {
        // go through every variant in self and check if there is a variant matching in other
        self.variants.iter().all(|&variant| {
            other
                .variants
                .iter()
                .any(|&other_variant| env.semantically_equivalent(variant, other_variant))
        })
    }
}

impl PrettyPrint for UnionType {
    fn pretty<'a>(
        &'a self,
        arena: &'a impl Index<TypeId, Output = Type>,
        limit: RecursionDepthBoundary,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        RcDoc::intersperse(
            self.variants
                .iter()
                .map(|&variant| limit.pretty(&arena[variant], arena)),
            RcDoc::line()
                .append(RcDoc::text("|"))
                .append(RcDoc::space()),
        )
        .nest(1)
        .group()
    }
}

/// Unifies union types
///
/// In a covariant context (checking if `rhs <: lhs`):
/// - For each variant in `rhs`, it must be a subtype of at least one variant in `lhs`
/// - This is the correct union subtyping rule: (A | B) <: C if and only if A <: C and B <: C
///
/// When inference variables (`Infer`) appear in union variants, they are unified with concrete
/// types as encountered. This approach works correctly for most common cases, but has
/// known edge cases:
///
/// *Known limitation*: When unifying unions containing inference variables with other unions,
/// type information can be lost. For example:
/// ```text
/// let x: _ | Integer = 3 in         // x is an Integer
/// let y: Boolean | String = "test" in  // y is a String
/// unify(x, y)  // Results in Boolean | Integer, losing the String information
/// ```
///
/// In this case, the inference variable in `x` unifies with Boolean from `y`,
/// even though `y` is actually a String. This can lead to counterintuitive results.
///
/// Possible solutions we might implement in the future:
/// 1. Disallow inference variables in unions (simple but restrictive)
/// 2. Collect and track all inferred variants (powerful but complex)
/// 3. Maintain current behavior but ensure proper documentation (current approach)
///
/// For example, if `lhs` is `Number | String` and `rhs` is `Integer | String`,
/// this would be valid because:
/// - `Integer <: Number`, so the `Integer` variant in `rhs` is covered
/// - `String <: String`, so the `String` variant in `rhs` is covered
pub(crate) fn unify_union(
    env: &mut UnificationEnvironment,
    lhs: &Type<UnionType>,
    rhs: &Type<UnionType>,
) {
    // For each variant in rhs (the provided type), check if it's a subtype of at least one lhs
    // variant
    for &rhs_variant in &rhs.kind.variants {
        // We need to find at least one lhs variant that this rhs variant is a subtype of
        let mut compatible_variant_found = false;

        for &lhs_variant in &lhs.kind.variants {
            let diagnostics = env.fatal_diagnostics();

            env.in_transaction(|env| {
                // Try to unify this specific pair of variants
                // In covariant context, we check if rhs_variant <: lhs_variant
                env.in_covariant(|env| {
                    env.unify_type(lhs_variant, rhs_variant);
                });

                if env.fatal_diagnostics() == diagnostics {
                    compatible_variant_found = true;

                    true
                } else {
                    false
                }
            });
        }

        if !compatible_variant_found {
            let diagnostic = union_variant_mismatch(env, &env.arena[rhs_variant], lhs);
            env.record_diagnostic(diagnostic);
        }
    }

    // If we reach here, every rhs variant is a subtype of at least one lhs variant
    // In a strictly variance-aware system, we do NOT modify the union types.
    // Each union maintains its original variants, preserving their identity and subtyping
    // relationships

    // TODO: flatten union type iff not "virtual"
}

pub(crate) fn unify_union_lhs(
    env: &mut UnificationEnvironment,
    lhs: &Type<UnionType>,
    rhs: &Type<TypeKind>,
) {
    let rhs = rhs.as_ref().map(|_| UnionType {
        variants: EcoVec::from([rhs.id]),
    });

    unify_union(env, lhs, &rhs);
}

pub(crate) fn unify_union_rhs(
    env: &mut UnificationEnvironment,
    lhs: &Type<TypeKind>,
    rhs: &Type<UnionType>,
) {
    let lhs = lhs.as_ref().map(|_| UnionType {
        variants: EcoVec::from([lhs.id]),
    });

    unify_union(env, &lhs, rhs);
}

/// Computes the intersection of two union types.
///
/// Applies the distribution rule: (A | B) ∩ (C | D) = (A ∩ C) | (A ∩ D) | (B ∩ C) | (B ∩ D)
/// Only variants with non-empty intersections are kept.
pub(crate) fn intersection_union(
    env: &mut UnificationEnvironment,
    lhs: &UnionType,
    rhs: &UnionType,
) -> UnionType {
    let mut variants = EcoVec::new();

    // Distribute intersection: (A | B) ∩ (C | D) = (A ∩ C) | (A ∩ D) | (B ∩ C) | (B ∩ D)
    for &lhs_variant in &lhs.variants {
        for &rhs_variant in &rhs.variants {
            let Some(type_id) = intersection_type_impl(env, lhs_variant, rhs_variant) else {
                // would result in `Never`
                continue;
            };

            // Only add non-Never results (Never means empty intersection)
            if matches!(env.arena[type_id].kind, TypeKind::Never) {
                continue;
            }

            // ... and avoid duplicates
            if variants
                .iter()
                .any(|&variant| env.structurally_equivalent(variant, type_id))
            {
                continue;
            }

            variants.push(type_id);
        }
    }

    UnionType { variants }
}

/// Computes the intersection of a type with a union type.
///
/// Applies the distribution rule: T ∩ (A|B) = (T ∩ A)|(T ∩ B)
pub(crate) fn intersection_with_union(
    env: &mut UnificationEnvironment,
    other: TypeId,
    union: &UnionType,
) -> UnionType {
    let mut variants = EcoVec::new();

    // Distribute intersection: T ∩ (A|B) = (T ∩ A)|(T ∩ B)
    for &variant in &union.variants {
        let Some(type_id) = intersection_type_impl(env, variant, other) else {
            // would result in `Never`
            continue;
        };

        // Only add non-Never results
        if matches!(env.arena[type_id].kind, TypeKind::Never) {
            continue;
        }

        // ... and duplicates
        if variants
            .iter()
            .any(|&variant| env.structurally_equivalent(variant, type_id))
        {
            continue;
        }

        variants.push(type_id);
    }

    // Create a union with the intersected variants
    UnionType { variants }
}

#[cfg(test)]
mod tests {
    use super::{UnionType, unify_union, unify_union_lhs, unify_union_rhs};
    use crate::r#type::{
        Type, TypeId,
        environment::Environment,
        intersection_type,
        kind::{TypeKind, primitive::PrimitiveType},
        test::{instantiate, setup_unify},
    };

    fn create_union_type(
        env: &mut Environment,
        variants: impl IntoIterator<Item = TypeId>,
    ) -> Type<UnionType> {
        let id = env.arena.push_with(|id| Type {
            id,
            span: crate::span::SpanId::SYNTHETIC,
            kind: TypeKind::Union(UnionType {
                variants: variants.into_iter().collect(),
            }),
        });

        env.arena[id]
            .clone()
            .map(|kind| kind.into_union().expect("should be union type"))
    }

    #[test]
    fn identical_unions_unify() {
        setup_unify!(env);

        // Create two identical unions: String | Number
        let str1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let num1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));

        let str2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let num2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));

        let lhs = create_union_type(&mut env, [str1, num1]);
        let rhs = create_union_type(&mut env, [str2, num2]);

        unify_union(&mut env, &lhs, &rhs);

        assert!(
            env.take_diagnostics().is_empty(),
            "Failed to unify identical unions"
        );
    }

    #[test]
    fn subtype_union_unifies() {
        setup_unify!(env);

        // lhs: Number | String
        // rhs: Integer | String
        // This should succeed because Integer <: Number
        let num = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let str1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));

        let int = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));
        let str2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));

        let lhs = create_union_type(&mut env, [num, str1]);
        let rhs = create_union_type(&mut env, [int, str2]);

        unify_union(&mut env, &lhs, &rhs);

        assert!(
            env.take_diagnostics().is_empty(),
            "Failed to unify union with subtype variants"
        );
    }

    #[test]
    fn incompatible_union_fails() {
        setup_unify!(env);

        // lhs: Number | String
        // rhs: Boolean | String
        // This should fail because Boolean is not a subtype of Number or String
        let num = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let str1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));

        let bool_type = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Boolean));
        let str2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));

        let lhs = create_union_type(&mut env, [num, str1]);
        let rhs = create_union_type(&mut env, [bool_type, str2]);

        unify_union(&mut env, &lhs, &rhs);

        assert!(
            !env.take_diagnostics().is_empty(),
            "Should fail to unify unions with incompatible variants"
        );
    }

    #[test]
    fn single_type_to_union() {
        setup_unify!(env);

        // lhs: Number | String
        // rhs: Number
        // This should succeed because Number <: (Number | String)
        let num1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let str1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let num2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));

        let union = create_union_type(&mut env, [num1, str1]);
        let single = env.arena[num2].clone();

        unify_union_lhs(&mut env, &union, &single);

        assert!(
            env.take_diagnostics().is_empty(),
            "Failed to unify single type with compatible union"
        );
    }

    #[test]
    fn union_to_single_type() {
        setup_unify!(env);

        // lhs: Number
        // rhs: Number | String
        // This should fail because (Number | String) is not a subtype of Number
        let num1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let num2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let str2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));

        let single = env.arena[num1].clone();
        let union = create_union_type(&mut env, [num2, str2]);

        unify_union_rhs(&mut env, &single, &union);

        assert!(
            !env.take_diagnostics().is_empty(),
            "Should fail to unify union with single type when union has extra variants"
        );
    }

    #[test]
    fn subtype_single_to_union() {
        setup_unify!(env);

        // lhs: Number | String
        // rhs: Integer
        // This should succeed because Integer <: Number <: (Number | String)
        let num = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let str1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let int = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));

        let union = create_union_type(&mut env, [num, str1]);
        let single = env.arena[int].clone();

        unify_union_lhs(&mut env, &union, &single);

        assert!(
            env.take_diagnostics().is_empty(),
            "Failed to unify subtype with union containing supertype"
        );
    }

    #[test]
    fn union_intersection_with_common_variant() {
        setup_unify!(env);

        // Create first union: String | Number
        let string1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let number = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let union1 = create_union_type(&mut env, [string1, number]);

        // Create second union: String | Boolean
        let string2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let boolean = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Boolean));
        let union2 = create_union_type(&mut env, [string2, boolean]);

        // Intersection should be: String
        let result = intersection_type(&mut env, union1.id, union2.id);

        // Result should be just the String type
        assert!(
            matches!(
                env.arena[result].kind,
                TypeKind::Primitive(PrimitiveType::String)
            ),
            "Expected String primitive, got {:?}",
            env.arena[result].kind
        );
    }

    #[test]
    fn union_intersection_with_no_common_variants() {
        setup_unify!(env);

        // Create first union: Number | Boolean
        let number = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let boolean1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Boolean));
        let union1 = create_union_type(&mut env, vec![number, boolean1]);

        // Create second union: String | Integer
        let string = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let integer = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Null));
        let union2 = create_union_type(&mut env, vec![string, integer]);

        // Intersection should be: Never (no compatible variants)
        let result = intersection_type(&mut env, union1.id, union2.id);

        // Result should be Never
        assert!(
            matches!(env.arena[result].kind, TypeKind::Never),
            "Expected Never type, got {:?}",
            env.arena[result].kind
        );
    }

    #[test]
    fn union_with_subtype_intersection() {
        setup_unify!(env);

        // Create first union: Number | String
        let number = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let string = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let union1 = create_union_type(&mut env, vec![number, string]);

        // Create second union: Integer | Boolean
        // (Integer is a subtype of Number)
        let integer = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));
        let boolean = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Boolean));
        let union2 = create_union_type(&mut env, vec![integer, boolean]);

        // Intersection should be: Integer
        let result = intersection_type(&mut env, union1.id, union2.id);

        // Result should be Integer
        assert!(
            matches!(
                env.arena[result].kind,
                TypeKind::Primitive(PrimitiveType::Integer)
            ),
            "Expected Integer primitive, got {:?}",
            env.arena[result].kind
        );
    }
}
