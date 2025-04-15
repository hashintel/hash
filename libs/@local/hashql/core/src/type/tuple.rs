use core::ops::Index;

use ecow::EcoVec;
use pretty::RcDoc;

use super::{
    Type, TypeId,
    environment::{StructuralEquivalenceEnvironment, UnificationEnvironment},
    error::tuple_length_mismatch,
    generic_argument::GenericArguments,
    pretty_print::PrettyPrint,
    recursion::RecursionDepthBoundary,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct TupleField {
    pub value: TypeId,
}

impl TupleField {
    fn structurally_equivalent(
        self,
        other: Self,
        env: &mut StructuralEquivalenceEnvironment,
    ) -> bool {
        env.structurally_equivalent(self.value, other.value)
    }
}

impl PrettyPrint for TupleField {
    fn pretty<'a>(
        &'a self,
        arena: &'a impl Index<TypeId, Output = Type>,
        limit: RecursionDepthBoundary,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        limit.pretty(&arena[self.value], arena)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TupleType {
    pub fields: EcoVec<TupleField>,

    pub arguments: GenericArguments,
}

impl TupleType {
    pub(crate) fn structurally_equivalent(
        &self,
        other: &Self,
        env: &mut StructuralEquivalenceEnvironment,
    ) -> bool {
        self.fields.len() == other.fields.len()
            && self
                .fields
                .iter()
                .zip(other.fields.iter())
                .all(|(&lhs, &rhs)| lhs.structurally_equivalent(rhs, env))
            && self
                .arguments
                .structurally_equivalent(&other.arguments, env)
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
                .append(self.fields[0].pretty(arena, limit))
                .append(RcDoc::text(",)"))
        } else {
            RcDoc::text("(")
                .append(
                    RcDoc::intersperse(
                        self.fields.iter().map(|field| field.pretty(arena, limit)),
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
    env: &mut UnificationEnvironment,
    lhs: &Type<TupleType>,
    rhs: &Type<TupleType>,
) {
    // Tuples must have the same number of fields
    if lhs.kind.fields.len() != rhs.kind.fields.len() {
        let diagnostic = tuple_length_mismatch(
            env.source,
            lhs,
            rhs,
            lhs.kind.fields.len(),
            rhs.kind.fields.len(),
        );

        env.record_diagnostic(diagnostic);

        return;
    }

    // Enter generic argument scope for both tuples
    lhs.kind.arguments.enter_scope(env);
    rhs.kind.arguments.enter_scope(env);

    // Unify corresponding fields in each tuple
    // In most type systems, tuple fields are covariant
    for (lhs_field, rhs_field) in lhs.kind.fields.iter().zip(rhs.kind.fields.iter()) {
        // Use covariant context for field types
        env.in_covariant(|env| {
            env.unify_type(lhs_field.value, rhs_field.value);
        });
    }

    // Exit generic argument scope
    lhs.kind.arguments.exit_scope(env);
    rhs.kind.arguments.exit_scope(env);

    // In a strictly variance-aware system, we do NOT modify the tuple types
    // Each tuple maintains its original structure, preserving identity and subtyping relationships
}

#[cfg(test)]
mod tests {
    use core::assert_matches::assert_matches;

    use super::{TupleField, TupleType};
    use crate::{
        span::SpanId,
        r#type::{
            Type, TypeId, TypeKind,
            environment::Environment,
            error::TypeCheckDiagnosticCategory,
            generic_argument::GenericArguments,
            primitive::PrimitiveType,
            test::{instantiate, setup_unify},
            tuple::unify_tuple,
        },
    };

    fn create_tuple_type(env: &mut Environment, field_types: Vec<TypeId>) -> Type<TupleType> {
        let fields = field_types
            .into_iter()
            .map(|type_id| TupleField { value: type_id })
            .collect();

        let tuple_type = TupleType {
            fields,
            arguments: GenericArguments::default(),
        };

        let id = env.arena.push_with(|id| Type {
            id,
            span: SpanId::SYNTHETIC,
            kind: TypeKind::Tuple(tuple_type),
        });

        env.arena[id]
            .clone()
            .map(|r#type| r#type.into_tuple().expect("should be tuple type"))
    }

    #[test]
    fn unify_same_length_tuples() {
        setup_unify!(env);

        // Create two tuple types with the same structure
        let int1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));
        let int2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));
        let str1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let str2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));

        let lhs_tuple = create_tuple_type(&mut env, vec![int1, str1]);
        let rhs_tuple = create_tuple_type(&mut env, vec![int2, str2]);

        // Should unify successfully
        unify_tuple(&mut env, &lhs_tuple, &rhs_tuple);

        // No errors should be reported
        let diagnostics = env.take_diagnostics();
        assert!(
            diagnostics.is_empty(),
            "Expected no diagnostics, got: {diagnostics:?}",
        );
    }

    #[test]
    fn unify_different_length_tuples() {
        setup_unify!(env);

        // Create two tuple types with different lengths
        let int1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));
        let str1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let int2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));

        let lhs_tuple = create_tuple_type(&mut env, vec![int1, str1]);
        let rhs_tuple = create_tuple_type(&mut env, vec![int2]);

        // Should report an error
        unify_tuple(&mut env, &lhs_tuple, &rhs_tuple);

        // Check error diagnostics
        let diagnostics = env.take_diagnostics();
        assert_eq!(
            diagnostics.len(),
            1,
            "Expected one diagnostic, got: {}",
            diagnostics.len()
        );

        assert_matches!(
            diagnostics[0].category,
            TypeCheckDiagnosticCategory::TupleLengthMismatch
        );
    }

    #[test]
    fn unify_tuples_with_incompatible_fields() {
        setup_unify!(env);

        // Create two tuple types with same length but incompatible field types
        let boolean = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Boolean));
        let str1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let str2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let number = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));

        let lhs_tuple = create_tuple_type(&mut env, vec![boolean, str1]);
        let rhs_tuple = create_tuple_type(&mut env, vec![number, str2]);

        // Should still try to unify the fields, which will report errors for the incompatible ones
        unify_tuple(&mut env, &lhs_tuple, &rhs_tuple);

        // Check for errors in the incompatible field
        let diagnostics = env.take_diagnostics();
        assert!(!diagnostics.is_empty(), "Expected at least one diagnostic");
    }

    #[test]
    fn unify_nested_tuples() {
        setup_unify!(env);

        // Create nested tuple types with compatible structures
        let int1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));
        let int2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));
        let str1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let str2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));

        // Create inner tuples
        let inner_lhs = create_tuple_type(&mut env, vec![int1]);
        let inner_rhs = create_tuple_type(&mut env, vec![int2]);

        // Use the inner tuple IDs in outer tuples
        let lhs_tuple = create_tuple_type(&mut env, vec![inner_lhs.id, str1]);
        let rhs_tuple = create_tuple_type(&mut env, vec![inner_rhs.id, str2]);

        // Should unify successfully
        unify_tuple(&mut env, &lhs_tuple, &rhs_tuple);

        // Check that there are no diagnostics
        let diagnostics = env.take_diagnostics();

        assert!(
            diagnostics.is_empty(),
            "Expected no diagnostics, got: {diagnostics:?}",
        );
    }
}
