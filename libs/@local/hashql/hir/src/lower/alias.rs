use core::convert::Infallible;

use hashql_core::{
    collections::{FastHashMap, HashMapExt as _, TinyVec},
    span::{SpanId, Spanned},
};

use super::error::{LoweringDiagnosticIssues, argument_override};
use crate::{
    context::HirContext,
    fold::{self, Fold, nested::Deep},
    intern::Interner,
    node::{
        Node, NodeData,
        kind::NodeKind,
        r#let::{Binding, VarIdMap},
        variable::Variable,
    },
};

#[derive(Debug)]
pub struct AliasReplacement<'env, 'heap, 'diag> {
    current_span: SpanId,
    scope: VarIdMap<Spanned<Variable<'heap>>>,
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
            current_span: SpanId::SYNTHETIC,
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

    fn fold_binding(&mut self, binding: Binding<'heap>) -> Self::Output<Binding<'heap>> {
        // Walk the node first, to resolve any aliases
        let Binding {
            span,
            binder,
            value,
        } = fold::walk_binding(self, binding)?;

        // If the let statement is a simple re-assignment add the variable to the scope, if the
        // variable is already in the scope, simply add the proxy / alias
        if let NodeKind::Variable(variable) = value.kind {
            let alias = if let Variable::Local(local) = variable {
                // Check if a binding already exists, if that is the case, re-use that, otherwise
                // create a new one
                self.scope
                    .get(&local.id.value)
                    .map_or(variable, |variable| variable.value)
            } else {
                variable
            };

            // We can just indiscriminately insert into the scope, and don't need to worry about
            // clean-up because everything is guaranteed to be unique by name.
            self.scope.insert_unique(
                binder.id,
                Spanned {
                    span: value.span,
                    value: alias,
                },
            );
        }

        Ok(Binding {
            span,
            binder,
            value,
        })
    }

    fn fold_variable(&mut self, variable: Variable<'heap>) -> Self::Output<Variable<'heap>> {
        let variable = fold::walk_variable(self, variable)?;

        // Check if said variable is an alias, in that case replace it with the aliased variable
        if let Variable::Local(local) = variable
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
                return Ok(alias.value);
            }

            // This happens when we have:
            // `let foo = bar in foo<T>`
            // To be able to use the aliased variable we need to transfer the arguments from the
            // current variable to the aliased variable

            // We need to create a new variable, that takes into account the new arguments, if both
            // have arguments, we simply override, this is so that we can continue compilation.
            let mut replacement = *alias;
            replacement.value.set_arguments_from(&variable);

            return Ok(replacement.value);
        }

        Ok(variable)
    }

    fn fold_node(&mut self, node: Node<'heap>) -> Self::Output<Node<'heap>> {
        let previous = self.current_span;
        self.current_span = node.span;

        let Ok(node) = fold::walk_node(self, node);

        self.current_span = previous;

        // Check if the node is a let expression and if said let expression is just an alias, if
        // that's the case we can safely remove it in favour of it's body, as all occurences have
        // already been replaced
        if let NodeKind::Let(r#let) = node.kind {
            // Only retain the bindings that are not aliases
            let mut bindings = TinyVec::from_slice_copy(&r#let.bindings);
            bindings.retain(|binding| !self.scope.contains_key(&binding.binder.id));

            // For each binding that exists, remove it from the scope. This is not strictly
            // necessary, but helps us keep memory usage down and not pollute the scope with
            // unnecessary aliases.
            for binding in &r#let.bindings {
                self.scope.remove(&binding.binder.id);
            }

            if bindings.is_empty() {
                // All the items are aliases, so we can safely remove it in favour of it's body
                return Ok(r#let.body);
            }

            // If the size is different (so there has been an alias), re-intern with the new set of
            // bindings and replace
            if bindings.len() != r#let.bindings.len() {
                let mut r#let = r#let;
                r#let.bindings = self.context.interner.bindings.intern_slice(&bindings);

                return Ok(self.context.interner.intern_node(NodeData {
                    id: node.id, // We keep the original id, because we're replacing the node
                    span: node.span,
                    kind: NodeKind::Let(r#let),
                }));
            }
        }

        Ok(node)
    }
}
