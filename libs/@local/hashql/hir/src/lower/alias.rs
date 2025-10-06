use core::convert::Infallible;

use hashql_core::collection::{FastHashMap, HashMapExt as _};

use super::error::{LoweringDiagnosticIssues, argument_override};
use crate::{
    context::HirContext,
    fold::{self, Fold, nested::Deep},
    intern::Interner,
    node::{
        Node,
        kind::NodeKind,
        r#let::{Let, VarId},
        variable::{Variable, VariableKind},
    },
};

#[derive(Debug)]
pub struct AliasReplacement<'env, 'heap, 'diag> {
    scope: FastHashMap<VarId, Variable<'heap>>,
    context: &'env HirContext<'env, 'heap>,
    diagnostics: &'diag mut LoweringDiagnosticIssues,
}

impl<'env, 'heap, 'diag> AliasReplacement<'env, 'heap, 'diag> {
    #[must_use]
    pub fn new(
        context: &'env HirContext<'env, 'heap>,
        diagnostics: &'diag mut LoweringDiagnosticIssues,
    ) -> Self {
        Self {
            scope: FastHashMap::default(),
            context,
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
        self.context.interner
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
                    .get(&local.id.value)
                    .copied()
                    .unwrap_or(*variable)
            } else {
                *variable
            };

            // We can just indiscriminately insert into the scope, and don't need to worry about
            // clean-up because everything is guaranteed to be unique by name.
            self.scope.insert_unique(r#let.name.id, alias);
        }

        let r#let = fold::walk_let(self, r#let)?;

        Ok(r#let)
    }

    fn fold_variable(&mut self, variable: Variable<'heap>) -> Self::Output<Variable<'heap>> {
        let variable = fold::walk_variable(self, variable)?;

        // Check if said variable is an alias, in that case replace it with the aliased variable
        if let VariableKind::Local(local) = variable.kind
            && let Some(alias) = self.scope.get(&local.id.value)
        {
            // In the case that there are arguments on the local variable, we need to check if we
            // aren't overriding any arguments that may have been applied. We can still continue,
            // but in the case that we override any arguments, we must accumulate a diagnostic.
            if !alias.arguments().is_empty() && !variable.arguments().is_empty() {
                // This guards against the following case:
                // `let foo = bar<T> in foo<U>`
                // this is invalid because we are overriding the type parameter T with U
                self.diagnostics
                    .push(argument_override(&variable, alias, &self.context.symbols));
            }

            if variable.arguments().is_empty() {
                // This happens when we have:
                // `let foo = bar<T> in foo`
                // we can just replace with the aliased variable, and don't care about the arguments
                return Ok(*alias);
            }

            // This happens when we have:
            // `let foo = bar in foo<T>`
            // To be able to use the aliased variable we need to transfer the arguments from the
            // current variable to the aliased variable

            // We need to create a new variable, that takes into account the new arguments, if both
            // have arguments, we simply override, this is so that we can continue compilation.
            let mut replacement = *alias;
            replacement.set_arguments_from(&variable);

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
            && self.scope.contains_key(&r#let.name.id)
        {
            // We don't really need to do this, but it helps us to not pollute the scope with
            // unnecessary aliases and therefore keep memory usage down.
            self.scope.remove(&r#let.name.id);

            return Ok(r#let.body);
        }

        Ok(node)
    }
}
