use pretty::RcDoc;

use crate::{
    newtype,
    symbol::Symbol,
    r#type::{
        Type, TypeId,
        environment::{Environment, UnificationEnvironment},
        error::generic_argument_not_found,
        pretty_print::{ORANGE, PrettyPrint},
        recursion::RecursionDepthBoundary,
    },
};

newtype!(
    pub struct GenericArgumentId(u32 is 0..=0xFFFF_FF00)
);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct GenericArgumentData {
    pub name: Symbol,
}

// The name is stored in the environment, to allow for `!Drop`
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct GenericArgument {
    pub id: GenericArgumentId,

    // The initial type constraint (if present)
    pub constraint: Option<TypeId>,
}

impl PrettyPrint for GenericArgument {
    fn pretty<'this>(
        &'this self,
        env: &'this Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'this, anstyle::Style> {
        let name = &env.auxiliary.arguments[&self.id].name;

        let mut doc = RcDoc::text(name.as_str()).annotate(ORANGE);

        if let Some(constraint) = self.constraint {
            doc = doc.append(
                RcDoc::text(":")
                    .append(RcDoc::line())
                    .append(limit.pretty(env, constraint)),
            );
        }

        doc
    }
}

// self.name.value == other.name.value
//     && env.semantically_equivalent(self.r#type, other.r#type)

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct GenericArguments<'heap>(&'heap [GenericArgument]);

impl<'heap> GenericArguments<'heap> {
    #[must_use]
    pub const fn from_slice(slice: &'heap [GenericArgument]) -> Self {
        Self(slice)
    }

    pub(crate) fn iter(&self) -> impl Iterator<Item = &GenericArgument> {
        self.0.iter()
    }

    pub fn merge(self, other: Self, env: &Environment<'heap>) -> Self {
        // We can merge without de-duplication, because every argument has a unique ID.
        // What we need to do tho, is to re-sort them, so that the invariants are maintained.
        let mut vec = Vec::with_capacity(self.0.len() + other.0.len());

        vec.extend_from_slice(self.0);
        vec.extend_from_slice(other.0);

        vec.sort_by(|lhs, rhs| lhs.id.cmp(&rhs.id));

        let arguments = env.interner.intern_generic_arguments(&vec);
        Self::from_slice(arguments)
    }
}

impl PrettyPrint for GenericArguments<'_> {
    fn pretty<'this>(
        &'this self,
        env: &'this Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'this, anstyle::Style> {
        if self.0.is_empty() {
            RcDoc::nil()
        } else {
            RcDoc::text("<")
                .append(
                    RcDoc::intersperse(
                        self.0.iter().map(|argument| argument.pretty(env, limit)),
                        RcDoc::text(",").append(RcDoc::line()),
                    )
                    .nest(1)
                    .group(),
                )
                .append(RcDoc::text(">"))
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Param {
    pub argument: GenericArgumentId,
}

impl Param {
    pub(crate) fn semantically_equivalent(&self, other: &Self) -> bool {
        self.argument == other.argument
    }
}

impl PrettyPrint for Param {
    fn pretty<'this>(
        &'this self,
        env: &'this Environment,
        _: RecursionDepthBoundary,
    ) -> RcDoc<'this, anstyle::Style> {
        let name = &env.auxiliary.arguments[&self.argument].name;

        RcDoc::text(name.as_str())
    }
}

/// Unifies a type parameter on the left-hand side with a concrete type on the right-hand side.
///
/// The variance context determines how the parameter and the concrete type are compared.
pub(crate) fn unify_param_lhs(env: &mut UnificationEnvironment, lhs: &Type<Param>, rhs: TypeId) {
    // First check if the generic argument is in scope
    let Some(argument) = env.generic_argument(lhs.kind.argument) else {
        let diagnostic = generic_argument_not_found(env.source, lhs, lhs.kind.argument);
        env.record_diagnostic(diagnostic);

        return;
    };

    // Use the current variance context for unification
    // This allows parameters to respect the variance of their containing context
    env.unify_type(argument, rhs);

    // In a strictly variance-aware system, we do NOT modify the parameter type
    // This preserves the identity of the parameter in the type graph
}

/// Unifies a concrete type on the left-hand side with a type parameter on the right-hand side.
///
/// The variance context determines how the concrete type and parameter are compared.
pub(crate) fn unify_param_rhs(env: &mut UnificationEnvironment, lhs: TypeId, rhs: &Type<Param>) {
    // First check if the generic argument is in scope
    let Some(argument) = env.generic_argument(rhs.kind.argument) else {
        let diagnostic = generic_argument_not_found(env.source, rhs, rhs.kind.argument);
        env.record_diagnostic(diagnostic);

        return;
    };

    // Use the current variance context for unification
    // This allows parameters to respect the variance of their containing context
    env.unify_type(lhs, argument);

    // In a strictly variance-aware system, we do NOT modify the parameter type
    // This preserves the identity of the parameter in the type graph
}

/// Unifies two type parameters.
///
/// The variance context determines how the parameters are compared.
pub(crate) fn unify_param(env: &mut UnificationEnvironment, lhs: &Type<Param>, rhs: &Type<Param>) {
    // First check if both generic arguments are in scope
    let lhs_argument = env.generic_argument(lhs.kind.argument);

    if lhs_argument.is_none() {
        let diagnostic = generic_argument_not_found(env.source, lhs, lhs.kind.argument);

        env.record_diagnostic(diagnostic);
    }

    let rhs_argument = env.generic_argument(rhs.kind.argument);

    if rhs_argument.is_none() {
        let diagnostic = generic_argument_not_found(env.source, rhs, rhs.kind.argument);

        env.record_diagnostic(diagnostic);
    }

    let Some((lhs_argument, rhs_argument)) = Option::zip(lhs_argument, rhs_argument) else {
        return;
    };

    // Use the current variance context for unification
    // This allows parameters to respect the variance of their containing context
    env.unify_type(lhs_argument, rhs_argument);

    // In a strictly variance-aware system, we do NOT modify the parameter types
    // This preserves the identity of the parameters in the type graph
}

#[cfg(test)]
mod tests {
    use core::assert_matches::assert_matches;

    use super::{
        GenericArgument, GenericArgumentId, GenericArguments, Param, unify_param, unify_param_lhs,
        unify_param_rhs,
    };
    use crate::{
        symbol::Symbol,
        r#type::{
            environment::Environment,
            error::TypeCheckDiagnosticCategory,
            kind::{TypeKind, primitive::PrimitiveType},
            test::{ident, instantiate, setup_unify},
        },
    };

    fn create_param(
        env: &mut Environment,
        argument_id: GenericArgumentId,
        name: &str,
    ) -> crate::r#type::Type<Param> {
        let id = env.arena.push_with(|id| crate::r#type::Type {
            id,
            span: crate::span::SpanId::SYNTHETIC,
            kind: TypeKind::Param(Param {
                argument: argument_id,
                name: Symbol::new(name),
            }),
        });

        env.arena[id].clone().map(|kind| match kind {
            TypeKind::Param(param) => param,
            _ => panic!("should be param type"),
        })
    }

    #[test]
    fn param_with_concrete_type() {
        setup_unify!(env);

        // Create a generic parameter T with Number type
        let t_id = GenericArgumentId::new(0);
        let t_type = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));

        // Enter the generic argument into scope
        env.enter_generic_argument_scope(t_id, t_type);

        // Create a parameter reference T
        let param = create_param(&mut env, t_id, "T");

        // Create a concrete Integer type
        let concrete = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));

        // Unify parameter (lhs) with concrete type (rhs)
        unify_param_lhs(&mut env, &param, concrete);

        assert!(
            env.take_diagnostics().is_empty(),
            "Failed to unify parameter with compatible concrete type"
        );

        // Clean up scope
        env.exit_generic_argument_scope(t_id);
    }

    #[test]
    fn concrete_type_with_param() {
        setup_unify!(env);

        // Create a generic parameter T with Integer type
        let t_id = GenericArgumentId::new(0);
        let t_type = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));

        // Enter the generic argument into scope
        env.enter_generic_argument_scope(t_id, t_type);

        // Create a parameter reference T
        let param = create_param(&mut env, t_id, "T");

        // Create a concrete Number type
        let concrete = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));

        // Unify concrete type (lhs) with parameter (rhs)
        unify_param_rhs(&mut env, concrete, &param);

        assert!(
            env.take_diagnostics().is_empty(),
            "Failed to unify concrete type with compatible parameter"
        );

        // Clean up scope
        env.exit_generic_argument_scope(t_id);
    }

    #[test]
    fn param_with_param() {
        setup_unify!(env);

        // Create two generic parameters T and U with Number and Integer types
        let t_id = GenericArgumentId::new(0);
        let u_id = GenericArgumentId::new(1);

        let t_type = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let u_type = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Integer));

        // Enter both arguments into scope
        env.enter_generic_argument_scope(t_id, t_type);
        env.enter_generic_argument_scope(u_id, u_type);

        // Create parameter references T and U
        let param_t = create_param(&mut env, t_id, "T");
        let param_u = create_param(&mut env, u_id, "U");

        // Unify parameters T and U
        unify_param(&mut env, &param_t, &param_u);

        assert!(
            env.take_diagnostics().is_empty(),
            "Failed to unify compatible parameters"
        );

        // Clean up scope
        env.exit_generic_argument_scope(u_id);
        env.exit_generic_argument_scope(t_id);
    }

    #[test]
    fn undefined_param_error() {
        setup_unify!(env);

        // Create a parameter reference to an undefined generic argument
        let undefined_id = GenericArgumentId::new(42);
        let param = create_param(&mut env, undefined_id, "T");

        // Create a concrete type
        let concrete = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));

        // Try to unify with undefined parameter
        unify_param_lhs(&mut env, &param, concrete);

        let diagnostics = env.take_diagnostics();
        assert_eq!(
            diagnostics.len(),
            1,
            "Should produce undefined parameter error"
        );

        assert_matches!(
            diagnostics[0].category,
            TypeCheckDiagnosticCategory::GenericArgumentNotFound,
            "Wrong error type for undefined parameter"
        );
    }

    #[test]
    fn generic_arguments_scope() {
        setup_unify!(env);

        // Create a generic argument T
        let t_id = GenericArgumentId::new(0);
        let t_type = instantiate(&mut env, TypeKind::Primitive(PrimitiveType::Number));
        let t_arg = GenericArgument {
            id: t_id,
            name: ident("T"),
            constraint: None,
            r#type: t_type,
        };

        // Create a GenericArguments collection
        let args = GenericArguments::from_iter([t_arg]);

        // Verify argument not in scope initially
        assert!(
            env.generic_argument(t_id).is_none(),
            "Argument should not be in scope before entering"
        );

        // Enter scope
        args.enter_scope(&mut env);

        // Verify argument is in scope
        assert!(
            env.generic_argument(t_id).is_some(),
            "Argument should be in scope after entering"
        );

        // Exit scope
        args.exit_scope(&mut env);

        // Verify argument no longer in scope
        assert!(
            env.generic_argument(t_id).is_none(),
            "Argument should not be in scope after exiting"
        );
    }
}
