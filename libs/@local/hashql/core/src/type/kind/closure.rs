use core::ops::Index;

use ecow::EcoVec;
use pretty::RcDoc;

use super::generic_argument::GenericArguments;
use crate::r#type::{
    Type, TypeId,
    environment::{EquivalenceEnvironment, UnificationEnvironment},
    error::function_parameter_count_mismatch,
    pretty_print::PrettyPrint,
    recursion::RecursionDepthBoundary,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ClosureType {
    pub params: EcoVec<TypeId>,
    pub return_type: TypeId,

    pub arguments: GenericArguments,
}

impl ClosureType {
    pub(crate) fn structurally_equivalent(
        &self,
        other: &Self,
        env: &mut EquivalenceEnvironment,
    ) -> bool {
        self.params.len() == other.params.len()
            && self
                .params
                .iter()
                .zip(other.params.iter())
                .all(|(&lhs, &rhs)| env.semantically_equivalent(lhs, rhs))
            && env.semantically_equivalent(self.return_type, other.return_type)
            && self
                .arguments
                .structurally_equivalent(&other.arguments, env)
    }
}

impl PrettyPrint for ClosureType {
    fn pretty<'a>(
        &'a self,
        arena: &'a impl Index<TypeId, Output = Type>,
        limit: RecursionDepthBoundary,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        self.arguments
            .pretty(arena, limit)
            .append(RcDoc::text("("))
            .append(
                RcDoc::intersperse(
                    self.params
                        .iter()
                        .map(|&param| limit.pretty(&arena[param], arena)),
                    RcDoc::text(",").append(RcDoc::line()),
                )
                .nest(1)
                .group(),
            )
            .append(RcDoc::text(")"))
            .append(RcDoc::line())
            .append(RcDoc::text("->"))
            .append(RcDoc::line())
            .append(limit.pretty(&arena[self.return_type], arena))
    }
}

/// Unifies closure types, respecting variance without concern for backward compatibility.
///
/// In a covariant context (checking if `rhs <: lhs`):
/// - Parameters are contravariant (checked with reversed subtyping relationship)
/// - Return type is covariant (checked with standard subtyping relationship)
/// - Parameter count must match exactly (invariant)
///
/// This follows standard function subtyping rules where:
/// - A function is a subtype of another if it accepts a wider range of inputs
/// - And produces a narrower range of outputs
pub(crate) fn unify_closure(
    env: &mut UnificationEnvironment,
    lhs: &Type<ClosureType>,
    rhs: &Type<ClosureType>,
) {
    // Function parameter count is invariant
    if lhs.kind.params.len() != rhs.kind.params.len() {
        let diagnostic = function_parameter_count_mismatch(
            env.source,
            lhs,
            rhs,
            lhs.kind.params.len(),
            rhs.kind.params.len(),
        );

        env.record_diagnostic(diagnostic);
        return;
    }

    // Enter generic argument scope for both closures
    lhs.kind.arguments.enter_scope(env);
    rhs.kind.arguments.enter_scope(env);

    // Parameters are contravariant
    // For a closure A to be a subtype of closure B:
    //   B's parameters must be subtypes of A's parameters
    //   (A can accept a wider range of inputs than B requires)
    for (&lhs_param, &rhs_param) in lhs.kind.params.iter().zip(rhs.kind.params.iter()) {
        env.in_contravariant(|env| {
            env.unify_type(lhs_param, rhs_param);
        });
    }

    // Return type is covariant
    // For a closure A to be a subtype of closure B:
    //   A's return type must be a subtype of B's return type
    //   (A can return a more specific type than B requires)
    env.in_covariant(|ctx| {
        ctx.unify_type(lhs.kind.return_type, rhs.kind.return_type);
    });

    // Clean up generic argument scope
    rhs.kind.arguments.exit_scope(env);
    lhs.kind.arguments.exit_scope(env);

    // We don't unify the body of the closure - that's handled elsewhere during type checking
    // In a strictly variance-aware system, we do NOT modify the closure types
    // Each closure maintains its original structure, preserving identity and subtyping
    // relationships
}

#[cfg(test)]
mod tests {
    use core::assert_matches::assert_matches;

    // Type hierarchy assumptions in these tests:
    // - Integer <: Number (Integer is a subtype of Number)
    // - Both are unrelated to String
    use super::{ClosureType, unify_closure};
    use crate::r#type::{
        TypeId,
        environment::Environment,
        error::TypeCheckDiagnosticCategory,
        kind::{
            TypeKind,
            generic_argument::{GenericArgument, GenericArgumentId, GenericArguments},
            primitive::PrimitiveType,
        },
        test::{ident, instantiate, setup_unify},
    };

    fn create_closure_type(
        env: &mut Environment,
        params: impl IntoIterator<Item = TypeId>,
        return_type: TypeId,
        arguments: GenericArguments,
    ) -> crate::r#type::Type<ClosureType> {
        let id = env.arena.push_with(|id| crate::r#type::Type {
            id,
            span: crate::span::SpanId::SYNTHETIC,
            kind: TypeKind::Closure(ClosureType {
                params: params.into_iter().collect(),
                return_type,
                arguments,
            }),
        });

        env.arena[id]
            .clone()
            .map(|kind| kind.into_closure().expect("should be closure type"))
    }

    #[test]
    fn identical_closures_unify() {
        setup_unify!(env);

        // Create two identical closures: (String) -> Number
        let param_type = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let return_type = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));

        let lhs = create_closure_type(
            &mut env,
            [param_type],
            return_type,
            GenericArguments::default(),
        );

        let param_type2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let return_type2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));

        let rhs = create_closure_type(
            &mut env,
            [param_type2],
            return_type2,
            GenericArguments::default(),
        );

        unify_closure(&mut env, &lhs, &rhs);

        assert!(
            env.take_diagnostics().is_empty(),
            "Failed to unify identical closures"
        );
    }

    #[test]
    fn parameter_contravariance() {
        setup_unify!(env);

        // Test contravariance of parameters:
        // lhs: (Integer) -> String    // More specific parameter
        // rhs: (Number) -> String     // More general parameter
        // This succeeds because:
        // - In contravariant context, unify_type(ctx, Integer, Number).
        // - This gets swapped to unify_type_covariant(ctx, Number, Integer).
        // - Which checks if Integer <: Number
        // - And Integer is indeed a subtype of Number
        let lhs_param = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));
        let rhs_param = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));

        let return_type = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));

        let lhs = create_closure_type(
            &mut env,
            [lhs_param],
            return_type,
            GenericArguments::default(),
        );

        let return_type2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));

        let rhs = create_closure_type(
            &mut env,
            [rhs_param],
            return_type2,
            GenericArguments::default(),
        );

        unify_closure(&mut env, &lhs, &rhs);

        // Should succeed because after the contravariant swap, Integer <: Number
        assert!(
            env.take_diagnostics().is_empty(),
            "Should succeed when parameter types respect contravariance"
        );
    }

    #[test]
    fn parameter_contravariance_failure() {
        setup_unify!(env);

        // Test contravariance of parameters:
        // lhs: (Number) -> String     // More general parameter
        // rhs: (Integer) -> String    // More specific parameter
        // This fails because:
        // - In contravariant context, unify_type(ctx, Number, Integer).
        // - This gets swapped to unify_type_covariant(ctx, Integer, Number).
        // - Which checks if Number <: Integer
        // - And Number is not a subtype of Integer
        let lhs_param = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let rhs_param = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));

        let return_type = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));

        let lhs = create_closure_type(
            &mut env,
            [lhs_param],
            return_type,
            GenericArguments::default(),
        );

        let return_type2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));

        let rhs = create_closure_type(
            &mut env,
            [rhs_param],
            return_type2,
            GenericArguments::default(),
        );

        unify_closure(&mut env, &lhs, &rhs);

        // Should fail because after the contravariant swap, Number is not <: Integer
        assert!(
            !env.take_diagnostics().is_empty(),
            "Should fail when parameter types violate contravariance"
        );
    }

    #[test]
    fn return_type_covariance_success() {
        setup_unify!(env);

        // Test covariance of return type
        // lhs: (String) -> Number  // More general return type
        // rhs: (String) -> Integer // More specific return type
        // Should succeed because Integer <: Number (Integer is a subtype of Number)
        let param_type = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let lhs_return = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let rhs_return = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));

        let lhs = create_closure_type(
            &mut env,
            [param_type],
            lhs_return,
            GenericArguments::default(),
        );

        let param_type2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let rhs = create_closure_type(
            &mut env,
            [param_type2],
            rhs_return,
            GenericArguments::default(),
        );

        unify_closure(&mut env, &lhs, &rhs);

        assert!(
            env.take_diagnostics().is_empty(),
            "Should succeed when return types follow covariance (Integer <: Number)"
        );
    }

    #[test]
    fn return_type_covariance_failure() {
        setup_unify!(env);

        // Test covariance of return type
        // lhs: (String) -> Integer
        // rhs: (String) -> Number
        // This should fail because in a covariant context, we require rhs.return <: lhs.return
        // and Number is not a subtype of Integer
        let param_type = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let lhs_return = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));
        let rhs_return = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));

        let lhs = create_closure_type(
            &mut env,
            [param_type],
            lhs_return,
            GenericArguments::default(),
        );

        let param_type2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let rhs = create_closure_type(
            &mut env,
            [param_type2],
            rhs_return,
            GenericArguments::default(),
        );

        unify_closure(&mut env, &lhs, &rhs);

        assert!(
            !env.take_diagnostics().is_empty(),
            "Should fail when return type violates covariance"
        );
    }

    #[test]
    fn parameter_count_mismatch() {
        setup_unify!(env);

        // Test parameter count mismatch
        // lhs: (String) -> Number
        // rhs: (String, Number) -> Number
        let param1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let return_type = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));

        let lhs = create_closure_type(&mut env, [param1], return_type, GenericArguments::default());

        let param2_1 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::String));
        let param2_2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let return_type2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));

        let rhs = create_closure_type(
            &mut env,
            [param2_1, param2_2],
            return_type2,
            GenericArguments::default(),
        );

        unify_closure(&mut env, &lhs, &rhs);

        let diagnostics = env.take_diagnostics();
        assert_eq!(
            diagnostics.len(),
            1,
            "Should produce parameter count mismatch error"
        );

        assert_matches!(
            diagnostics[0].category,
            TypeCheckDiagnosticCategory::FunctionParameterCountMismatch,
            "Wrong error type for parameter count mismatch"
        );
    }

    #[test]
    fn combined_variance_test_failure() {
        setup_unify!(env);

        // Tests both contravariance of parameters and covariance of return types:
        // lhs: (Number) -> Number     // More general parameter, more general return.
        // rhs: (Integer) -> Integer   // More specific parameter, more specific return.
        // But this actually FAILS because:
        // - For params (contravariant): In a contravariant position, Number <: Integer needs to be
        //   true but it isn't - Number is a supertype of Integer, not a subtype.
        // - For return (covariant): Integer <: Number is true, so this part is fine.

        let lhs_param = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let lhs_return = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));

        let rhs_param = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));
        let rhs_return = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));

        let lhs = create_closure_type(
            &mut env,
            [lhs_param],
            lhs_return,
            GenericArguments::default(),
        );

        let rhs = create_closure_type(
            &mut env,
            [rhs_param],
            rhs_return,
            GenericArguments::default(),
        );

        unify_closure(&mut env, &lhs, &rhs);

        assert!(
            !env.take_diagnostics().is_empty(),
            "Should fail because parameter contravariance is violated (Number is not a subtype of \
             Integer)"
        );
    }

    #[test]
    fn combined_variance_test_success() {
        setup_unify!(env);

        // Tests both contravariance of parameters and covariance of return types
        // lhs: (Integer) -> Number     // More specific parameter, more general return
        // rhs: (Number) -> Integer     // More general parameter, more specific return
        // This should succeed because:
        // - For params (contravariant): Integer <: Number is true.
        // - For return (covariant): Integer <: Number is true.

        let lhs_param = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));
        let lhs_return = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));

        let rhs_param = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let rhs_return = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));

        let lhs = create_closure_type(
            &mut env,
            [lhs_param],
            lhs_return,
            GenericArguments::default(),
        );

        let rhs = create_closure_type(
            &mut env,
            [rhs_param],
            rhs_return,
            GenericArguments::default(),
        );

        unify_closure(&mut env, &lhs, &rhs);

        assert!(
            env.take_diagnostics().is_empty(),
            "Should succeed when both parameter contravariance and return type covariance are \
             satisfied"
        );
    }

    #[test]
    fn generic_closure_unification() {
        setup_unify!(env);

        // Create a generic type parameter T
        let t_id = GenericArgumentId::new(0);
        let t_type = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let t_arg = GenericArgument {
            id: t_id,
            name: ident("T"),
            constraint: None,
            r#type: t_type,
        };

        // Create closures with generic parameter:
        // lhs: <T>(T) -> T
        let param_type = t_type;
        let return_type = t_type;

        let lhs = create_closure_type(
            &mut env,
            vec![param_type],
            return_type,
            GenericArguments::from_iter([t_arg]),
        );

        // rhs: (Number) -> Number
        let param_type2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let return_type2 = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));

        let rhs = create_closure_type(
            &mut env,
            vec![param_type2],
            return_type2,
            GenericArguments::default(),
        );

        unify_closure(&mut env, &lhs, &rhs);

        assert!(
            env.take_diagnostics().is_empty(),
            "Failed to unify generic closure with concrete closure"
        );
    }
}
