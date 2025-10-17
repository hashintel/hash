use core::convert::Infallible;

use hashql_core::{
    id::bit_vec::{BitRelations as _, MixedBitSet},
    span::SpanId,
};

use crate::{
    context::HirContext,
    fold::{self, Fold},
    intern::Interner,
    lower::{dataflow::VariableDependencies, normalization::is_anf_atom},
    node::{
        Node, PartialNode,
        closure::Closure,
        kind::NodeKind,
        r#let::{Binding, Let},
    },
    visit::Visitor as _,
};

// TODO: think about hoisting of nested graph reads, that will be a bit more complicated
//
// The problem is basically: if we hoist a nested graph read, then the graph read might have
// additional constraints that we need to consider.
//
// We know that we're in a closure, so that is fine, we know that there is a set of bindings. What
// we could do is first evaluate the children, merge the bindings that are the result of it, and
// then use that to unify the variables?
//
// We would basically first hoist the inner into the let bindings. Then for each of those bindings
// we check if they are used outside, and if they are not we bring them up as well. This should work
// well because we know that a graph read is always at a binding site, so we can just insert them
// and then work on those to "bring them up".
//
// This would basically be a "flat-map" of sorts.
//
// We actually stay in HIR(ANF) that way, because we just move it out the binding site.
//
// It would basically be this:
// 1) for each binding in bindings:
//      - walk the tree w/ the unification visitor to see any mentioned variables
//      - descend using fold
//      - add any collected bindings to our current list of bindings
// 2) for each binding in collected bindings:
//      - check: is it mentioning any of the variables of the closure we're visiting?
//      - if not, add it to the list of bindings to hoist
// upon encountering a graph read filter we set a flag to enable hoisting inside of closures, which
// is then disabled once entered. This means that we do let-hoisting only there where it makes
// sense.
//
// But this algorithm works for *any* hoistable expression -> means it needs a rename.

// The idea is the following: for any let binding inside the function (as the body is an anf_atom),
// union name of the binding with any variables that have been mentioned.
// This allows us to create "sets" of variables that are used together.
//
// Note that we only do this for top-level let bindings (we could also do that for other conditions)
// — such as nested closures - but that has the problem of early evaluating code we don't want to
// evaluate. Instead we just pull closures out.
//
// The problem is just: union-find data structures, `InPlaceUnificationTable` requires us to have
// the `Key` be sequential, something we cannot guarantee, we might also just be in the "middle", so
// this would be memory blowup.

pub struct GraphHoist<'ctx, 'env, 'heap> {
    context: &'ctx HirContext<'env, 'heap>,
    scope: Option<Vec<Binding<'heap>>>,
    nested_inside_graph: bool,
}

impl<'ctx, 'env, 'heap> GraphHoist<'ctx, 'env, 'heap> {
    #[must_use]
    pub const fn new(context: &'ctx HirContext<'env, 'heap>) -> Self {
        Self {
            context,
            scope: None,
            nested_inside_graph: false,
        }
    }

    fn build_body(
        &self,
        span: SpanId,
        bindings: &[Binding<'heap>],
        body: Node<'heap>,
    ) -> Node<'heap> {
        if bindings.is_empty() {
            return body;
        }

        self.context.interner.intern_node(PartialNode {
            span,
            kind: NodeKind::Let(Let {
                bindings: self.context.interner.bindings.intern_slice(bindings),
                body,
            }),
        })
    }

    pub fn run(&mut self, node: Node<'heap>) -> Node<'heap> {
        let (bindings, body) = if let NodeKind::Let(Let { bindings, body }) = node.kind {
            (bindings.0, *body)
        } else {
            (&[] as &[_], node)
        };

        debug_assert!(is_anf_atom(&body), "HIR should be in ANF");
        debug_assert!(self.scope.is_none(), "scope should not be set");

        self.scope = Some(Vec::with_capacity(bindings.len()));

        for &binding in bindings {
            let Ok(binding) = fold::walk_binding(self, binding);

            self.scope
                .as_mut()
                .unwrap_or_else(|| unreachable!("scope should be set"))
                .push(binding);
        }

        // We do not fold the body, because it cannot contribute any bindings, bindings only happens
        // in closures, which are not atoms.
        let bindings = self
            .scope
            .take()
            .unwrap_or_else(|| unreachable!("scope should be set"));

        self.build_body(node.span, &bindings, body)
    }
}

impl<'heap> Fold<'heap> for GraphHoist<'_, '_, 'heap> {
    type NestedFilter = crate::fold::nested::Deep;
    type Output<T>
        = Result<T, !>
    where
        T: 'heap;
    type Residual = Result<Infallible, !>;

    fn interner(&self) -> &Interner<'heap> {
        self.context.interner
    }

    fn fold_node(&mut self, node: Node<'heap>) -> Self::Output<Node<'heap>> {
        // Check if the node that we're entering is a nested (supported) closure, if that is the
        // case we can safely continue hoisting with a scope, otherwise we cannot and close the
        // scope.
        if !matches!(node.kind, NodeKind::Graph(_)) && !self.nested_inside_graph {
            let previous = self.scope.take();

            let Ok(node) = fold::walk_node(self, node);

            self.scope = previous;
            return Ok(node);
        }

        // We need to check if we're directly nested inside the graph (such as a closure), in that
        // case we continue hoisting, as the closure is part of the graph itself.
        self.nested_inside_graph = matches!(node.kind, NodeKind::Graph(_));
        fold::walk_node(self, node)
    }

    fn fold_closure(&mut self, closure: Closure<'heap>) -> Self::Output<Closure<'heap>> {
        let (bindings, body) = if let NodeKind::Let(Let { bindings, body }) = closure.body.kind {
            (bindings.0, *body)
        } else {
            (&[] as &[_], closure.body)
        };

        debug_assert!(is_anf_atom(&body), "HIR should be in ANF");

        // Inside the closure any folding is fine, but only for the first set of bindings, we manage
        // two distinct scopes. The upper scope (which is currently held in the struct), and the
        // current scope.
        // As we descend down, we create a new scope and replace the upper scope (if available)
        // This scope are all the bindings that we will be creating a part of the closure bindings.
        // TODO: recycler
        let upper_scope = self.scope.replace(Vec::with_capacity(bindings.len()));

        for &binding in bindings {
            let Ok(binding) = fold::walk_binding(self, binding);

            self.scope
                .as_mut()
                .unwrap_or_else(|| unreachable!("scope should be set"))
                .push(binding);
        }

        // We do not fold the body, because it cannot contribute any bindings, bindings only happens
        // in closures, which are not atoms.

        // check if we can actually promote any bindings, if not, we just stop
        let Some(mut upper_scope) = upper_scope else {
            // We cannot promote, so skip promotion logic, reset the scope, set the bindings, and
            // continue
            let current_scope = self
                .scope
                .take()
                .unwrap_or_else(|| unreachable!("scope should be set"));

            return Ok(Closure {
                signature: closure.signature,
                body: self.build_body(closure.body.span, &current_scope, body),
            });
        };

        let mut current_scope = self
            .scope
            .take()
            .unwrap_or_else(|| unreachable!("scope should be set"));

        // Check for any of the collected bindings if they can be promoted
        // TODO: recycler
        let mut dependent = MixedBitSet::new_empty(self.context.counter.var.size());
        for param in closure.signature.params {
            dependent.insert(param.name.id);
        }

        current_scope.retain(|binding| {
            // TODO: recycler
            let mut deps = VariableDependencies::new(self.context);
            deps.visit_node(&binding.value);
            let mut deps = deps.finish();

            deps.intersect(&dependent);

            if deps.is_empty() {
                // This binding doesn't depend on any of the closure parameters
                // We can hoist it out of the closure
                upper_scope.push(*binding);
                true
            } else {
                // One of the variables that depend on the closure parameters has been mentioned
                // We can't hoist this binding out of the closure
                // "infect" the dependent variables
                dependent.insert(binding.binder.id);
                false
            }
        });

        // re-instate the upper scope
        self.scope = Some(upper_scope);

        Ok(Closure {
            signature: closure.signature,
            body: self.build_body(closure.body.span, &current_scope, body),
        })
    }
}
