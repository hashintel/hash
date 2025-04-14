use core::ops::Index;

use ecow::EcoVec;
use pretty::RcDoc;

use super::{
    Type, TypeId,
    environment::UnificationContext,
    error::generic_argument_not_found,
    pretty_print::{ORANGE, PrettyPrint},
    recursion::{RecursionGuard, RecursionLimit},
    unify_type,
};
use crate::{
    arena::Arena,
    newtype,
    symbol::{Ident, Symbol},
};

newtype!(
    pub struct GenericArgumentId(u32 is 0..=0xFFFF_FF00)
);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct GenericArgument {
    pub id: GenericArgumentId,
    pub name: Ident,

    // The initial type constraint (if present), only used during instantiation and pretty-printing
    pub constraint: Option<TypeId>,

    pub r#type: TypeId,
}

impl GenericArgument {
    fn structurally_equivalent(
        &self,
        other: &Self,
        arena: &Arena<Type>,
        guard: &mut RecursionGuard,
    ) -> bool {
        self.name.value == other.name.value
            && arena[self.r#type].structurally_equivalent_impl(&arena[other.r#type], arena, guard)
    }
}

impl PrettyPrint for GenericArgument {
    fn pretty<'a>(
        &'a self,
        arena: &'a impl Index<TypeId, Output = Type>,
        limit: RecursionLimit,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        let mut doc = RcDoc::text(self.name.value.as_str()).annotate(ORANGE);

        if let Some(constraint) = self.constraint {
            doc = doc.append(
                RcDoc::text(":")
                    .append(RcDoc::line())
                    .append(limit.pretty(&arena[constraint], arena)),
            );
        }

        doc
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct GenericArguments(EcoVec<GenericArgument>);

impl GenericArguments {
    #[must_use]
    pub const fn new() -> Self {
        Self(EcoVec::new())
    }

    pub fn merge(&mut self, other: Self) {
        // We can merge without de-duplication, because every argument has a unique ID.
        // What we need to do tho, is to re-sort them, so that the invariants are maintained.
        self.0.extend(other.0);

        let slice = self.0.make_mut();
        slice.sort_by(|lhs, rhs| lhs.name.value.cmp(&rhs.name.value));
    }

    pub fn enter_scope(&self, context: &mut UnificationContext) {
        for argument in &self.0 {
            context.enter_generic_argument_scope(argument.id, argument.r#type);
        }
    }

    pub fn exit_scope(&self, context: &mut UnificationContext) {
        for argument in &self.0 {
            context.exit_generic_argument_scope(argument.id);
        }
    }

    pub(crate) fn structurally_equivalent(
        &self,
        other: &Self,
        arena: &Arena<Type>,
        guard: &mut RecursionGuard,
    ) -> bool {
        // We do not need to sort the arguments, because the constructor
        // guarantees that they are in lexicographical order.

        self.0.len() == other.0.len()
            && self
                .0
                .iter()
                .zip(other.0.iter())
                .all(|(lhs, rhs)| lhs.structurally_equivalent(rhs, arena, guard))
    }
}

impl FromIterator<GenericArgument> for GenericArguments {
    fn from_iter<T: IntoIterator<Item = GenericArgument>>(iter: T) -> Self {
        let mut vec = Vec::from_iter(iter);
        vec.sort_by(|lhs, rhs| lhs.name.value.cmp(&rhs.name.value));

        Self(EcoVec::from(vec))
    }
}

impl PrettyPrint for GenericArguments {
    fn pretty<'a>(
        &'a self,
        arena: &'a impl Index<TypeId, Output = Type>,
        limit: RecursionLimit,
    ) -> RcDoc<'a, anstyle::Style> {
        if self.0.is_empty() {
            RcDoc::nil()
        } else {
            RcDoc::text("<")
                .append(
                    RcDoc::intersperse(
                        self.0.iter().map(|argument| argument.pretty(arena, limit)),
                        RcDoc::text(",").append(RcDoc::line()),
                    )
                    .nest(1)
                    .group(),
                )
                .append(RcDoc::text(">"))
        }
    }
}

impl Default for GenericArguments {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Param {
    pub argument: GenericArgumentId,

    pub name: Symbol,
}

impl Param {
    pub(crate) fn structurally_equivalent(&self, other: &Self) -> bool {
        self.argument == other.argument && self.name == other.name
    }
}

impl PrettyPrint for Param {
    fn pretty<'a>(
        &'a self,
        _: &'a impl Index<TypeId, Output = Type>,
        _: RecursionLimit,
    ) -> RcDoc<'a, anstyle::Style> {
        RcDoc::text(self.name.as_str())
    }
}

/// Unifies a type parameter on the left-hand side with a concrete type on the right-hand side.
///
/// The variance context determines how the parameter and the concrete type are compared.
pub(crate) fn unify_param_lhs(context: &mut UnificationContext, lhs: &Type<Param>, rhs: TypeId) {
    // First check if the generic argument is in scope
    let Some(argument) = context.generic_argument(lhs.kind.argument) else {
        let diagnostic = generic_argument_not_found(context.source, lhs, lhs.kind.argument);
        context.record_diagnostic(diagnostic);
        context.mark_error(lhs.id);
        return;
    };

    // Use the current variance context for unification
    // This allows parameters to respect the variance of their containing context
    unify_type(context, argument, rhs);

    // In a strictly variance-aware system, we do NOT modify the parameter type
    // This preserves the identity of the parameter in the type graph
}

/// Unifies a concrete type on the left-hand side with a type parameter on the right-hand side.
///
/// The variance context determines how the concrete type and parameter are compared.
pub(crate) fn unify_param_rhs(context: &mut UnificationContext, lhs: TypeId, rhs: &Type<Param>) {
    // First check if the generic argument is in scope
    let Some(argument) = context.generic_argument(rhs.kind.argument) else {
        let diagnostic = generic_argument_not_found(context.source, rhs, rhs.kind.argument);
        context.record_diagnostic(diagnostic);
        context.mark_error(rhs.id);
        return;
    };

    // Use the current variance context for unification
    // This allows parameters to respect the variance of their containing context
    unify_type(context, lhs, argument);

    // In a strictly variance-aware system, we do NOT modify the parameter type
    // This preserves the identity of the parameter in the type graph
}

/// Unifies two type parameters.
///
/// The variance context determines how the parameters are compared.
pub(crate) fn unify_param(context: &mut UnificationContext, lhs: &Type<Param>, rhs: &Type<Param>) {
    // First check if both generic arguments are in scope
    let lhs_argument = context.generic_argument(lhs.kind.argument);

    if lhs_argument.is_none() {
        let diagnostic = generic_argument_not_found(context.source, lhs, lhs.kind.argument);

        context.record_diagnostic(diagnostic);
        context.mark_error(lhs.id);
    }

    let rhs_argument = context.generic_argument(rhs.kind.argument);

    if rhs_argument.is_none() {
        let diagnostic = generic_argument_not_found(context.source, rhs, rhs.kind.argument);

        context.record_diagnostic(diagnostic);
        context.mark_error(rhs.id);
    }

    let Some((lhs_argument, rhs_argument)) = Option::zip(lhs_argument, rhs_argument) else {
        return;
    };

    // Use the current variance context for unification
    // This allows parameters to respect the variance of their containing context
    unify_type(context, lhs_argument, rhs_argument);

    // In a strictly variance-aware system, we do NOT modify the parameter types
    // This preserves the identity of the parameters in the type graph
}

#[cfg(test)]
mod tests {
    use super::{
        GenericArgument, GenericArgumentId, GenericArguments, Param, unify_param, unify_param_lhs,
        unify_param_rhs,
    };
    use crate::{
        symbol::Symbol,
        r#type::{
            TypeKind,
            primitive::PrimitiveType,
            test::{ident, instantiate, setup},
        },
    };

    fn create_param(
        context: &mut crate::r#type::environment::UnificationContext,
        argument_id: GenericArgumentId,
        name: &str,
    ) -> crate::r#type::Type<Param> {
        let id = context
            .arena_mut_test_only()
            .push_with(|id| crate::r#type::Type {
                id,
                span: crate::span::SpanId::SYNTHETIC,
                kind: TypeKind::Param(Param {
                    argument: argument_id,
                    name: Symbol::new(name),
                }),
            });

        context.arena[id].clone().map(|kind| match kind {
            TypeKind::Param(param) => param,
            _ => panic!("should be param type"),
        })
    }

    #[test]
    fn param_with_concrete_type() {
        let mut context = setup();

        // Create a generic parameter T with Number type
        let t_id = GenericArgumentId::new(0);
        let t_type = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));

        // Enter the generic argument into scope
        context.enter_generic_argument_scope(t_id, t_type);

        // Create a parameter reference T
        let param = create_param(&mut context, t_id, "T");

        // Create a concrete Integer type
        let concrete = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Integer));

        // Unify parameter (lhs) with concrete type (rhs)
        unify_param_lhs(&mut context, &param, concrete);

        assert!(
            context.take_diagnostics().is_empty(),
            "Failed to unify parameter with compatible concrete type"
        );

        // Clean up scope
        context.exit_generic_argument_scope(t_id);
    }

    #[test]
    fn concrete_type_with_param() {
        let mut context = setup();

        // Create a generic parameter T with Integer type
        let t_id = GenericArgumentId::new(0);
        let t_type = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Integer));

        // Enter the generic argument into scope
        context.enter_generic_argument_scope(t_id, t_type);

        // Create a parameter reference T
        let param = create_param(&mut context, t_id, "T");

        // Create a concrete Number type
        let concrete = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));

        // Unify concrete type (lhs) with parameter (rhs)
        unify_param_rhs(&mut context, concrete, &param);

        assert!(
            context.take_diagnostics().is_empty(),
            "Failed to unify concrete type with compatible parameter"
        );

        // Clean up scope
        context.exit_generic_argument_scope(t_id);
    }

    #[test]
    fn param_with_param() {
        let mut context = setup();

        // Create two generic parameters T and U with Number and Integer types
        let t_id = GenericArgumentId::new(0);
        let u_id = GenericArgumentId::new(1);

        let t_type = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));
        let u_type = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Integer));

        // Enter both arguments into scope
        context.enter_generic_argument_scope(t_id, t_type);
        context.enter_generic_argument_scope(u_id, u_type);

        // Create parameter references T and U
        let param_t = create_param(&mut context, t_id, "T");
        let param_u = create_param(&mut context, u_id, "U");

        // Unify parameters T and U
        unify_param(&mut context, &param_t, &param_u);

        assert!(
            context.take_diagnostics().is_empty(),
            "Failed to unify compatible parameters"
        );

        // Clean up scope
        context.exit_generic_argument_scope(u_id);
        context.exit_generic_argument_scope(t_id);
    }

    #[test]
    fn undefined_param_error() {
        let mut context = setup();

        // Create a parameter reference to an undefined generic argument
        let undefined_id = GenericArgumentId::new(42);
        let param = create_param(&mut context, undefined_id, "T");

        // Create a concrete type
        let concrete = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));

        // Try to unify with undefined parameter
        unify_param_lhs(&mut context, &param, concrete);

        let diagnostics = context.take_diagnostics();
        assert_eq!(
            diagnostics.len(),
            1,
            "Should produce undefined parameter error"
        );
        assert!(
            matches!(
                diagnostics[0].category,
                crate::r#type::error::TypeCheckDiagnosticCategory::GenericArgumentNotFound
            ),
            "Wrong error type for undefined parameter"
        );
    }

    #[test]
    fn generic_arguments_scope() {
        let mut context = setup();

        // Create a generic argument T
        let t_id = GenericArgumentId::new(0);
        let t_type = instantiate(&mut context, TypeKind::Primitive(PrimitiveType::Number));
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
            context.generic_argument(t_id).is_none(),
            "Argument should not be in scope before entering"
        );

        // Enter scope
        args.enter_scope(&mut context);

        // Verify argument is in scope
        assert!(
            context.generic_argument(t_id).is_some(),
            "Argument should be in scope after entering"
        );

        // Exit scope
        args.exit_scope(&mut context);

        // Verify argument no longer in scope
        assert!(
            context.generic_argument(t_id).is_none(),
            "Argument should not be in scope after exiting"
        );
    }
}
