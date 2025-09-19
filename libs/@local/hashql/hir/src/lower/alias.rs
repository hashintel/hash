use core::convert::Infallible;

use hashql_core::{
    module::{Universe, universe::FastRealmsMap},
    symbol::Symbol,
};

use super::error::{LoweringDiagnosticIssues, argument_override};
use crate::{
    fold::{self, Fold, nested::Deep},
    intern::Interner,
    node::{
        Node,
        kind::NodeKind,
        r#let::Let,
        variable::{Variable, VariableKind},
    },
};

#[derive(Debug)]
pub struct AliasReplacement<'env, 'heap, 'diag> {
    scope: FastRealmsMap<Symbol<'heap>, Variable<'heap>>,
    interner: &'env Interner<'heap>,
    diagnostics: &'diag mut LoweringDiagnosticIssues,
}

impl<'env, 'heap, 'diag> AliasReplacement<'env, 'heap, 'diag> {
    #[must_use]
    pub fn new(
        interner: &'env Interner<'heap>,
        diagnostics: &'diag mut LoweringDiagnosticIssues,
    ) -> Self {
        Self {
            scope: FastRealmsMap::new(),
            interner,
            diagnostics,
        }
    }
}

impl<'heap> Fold<'heap> for AliasReplacement<'_, 'heap, '_> {
    type NestedFilter = Deep;
    type Output<T>
        = Result<T, !>
    where
        T: 'heap;
    type Residual = Result<Infallible, !>;

    fn interner(&self) -> &Interner<'heap> {
        self.interner
    }

    fn fold_let(&mut self, mut r#let: Let<'heap>) -> Self::Output<Let<'heap>> {
        // Walk the node first, to resolve any aliases
        r#let.value = fold::walk_node(self, r#let.value)?;

        // if the let statement is a simple re-assignment add the variable to the scope, if the
        // variable is already in the scope, simply add the proxy / alias
        if let NodeKind::Variable(variable) = r#let.value.kind {
            let alias = if let VariableKind::Local(local) = variable.kind {
                // Check if a binding already exists, if that is the case, re-use that, otherwise
                // create a new one
                self.scope
                    .get(Universe::Value, &local.name.value)
                    .copied()
                    .unwrap_or(*variable)
            } else {
                *variable
            };

            // We can just indiscriminately insert into the scope, and don't need to worry about
            // clean-up because everything is guaranteed to be unique by name.
            self.scope
                .insert_unique(Universe::Value, r#let.name.value, alias);
        }

        let r#let = fold::walk_let(self, r#let)?;

        Ok(r#let)
    }

    fn fold_variable(&mut self, variable: Variable<'heap>) -> Self::Output<Variable<'heap>> {
        let variable = fold::walk_variable(self, variable)?;

        // Check if said variable is an alias, in that case replace it with the aliased variable
        if let VariableKind::Local(local) = variable.kind
            && let Some(replacement) = self.scope.get(Universe::Value, &local.name.value)
        {
            // In the case that there are arguments on the local variable, we need to check if we
            // aren't overriding any arguments that may have been applied. We can still continue,
            // but in the case that we override any arguments, we must accumulate a diagnostic.
            if !replacement.arguments().is_empty() && !variable.arguments().is_empty() {
                self.diagnostics
                    .push(argument_override(&variable, replacement));
            }

            if variable.arguments().is_empty() {
                return Ok(*replacement);
            }

            // We need to create a new variable, that takes into account the new arguments, if both
            // have arguments, we simply override, this is so that we can continue compilation.
            let mut replacement = *replacement;
            *replacement.arguments_mut() = variable.arguments();

            return Ok(replacement);
        }

        Ok(variable)
    }

    fn fold_node(&mut self, node: Node<'heap>) -> Self::Output<Node<'heap>> {
        let node = fold::walk_node(self, node)?;

        // Check if the node is a let expression and if said let expression is just an alias, if
        // that's the case we can safely remove it in favour of it's body, as all occurences have
        // already been replaced
        if let NodeKind::Let(r#let) = node.kind
            && self.scope.contains_key(Universe::Value, &r#let.name.value)
        {
            // We don't really need to do this, but it helps us to not pollute the scope with
            // unnecessary aliases and therefore keep memory usage down.
            self.scope.remove(Universe::Value, &r#let.name.value);

            return Ok(r#let.body);
        }

        Ok(node)
    }
}
