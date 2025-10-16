use core::convert::Infallible;

use hashql_core::id::bit_vec::{BitRelations, MixedBitSet};

use crate::{
    context::HirContext,
    fold::Fold,
    intern::Interner,
    lower::{dataflow::VariableDependencies, normalization::is_anf_atom},
    node::{
        closure::Closure,
        kind::NodeKind,
        r#let::{Binding, Let, VarId, VarIdUnionFind},
    },
    visit::Visitor,
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
    lifted: Vec<Binding<'heap>>,
}

impl<'ctx, 'env, 'heap> GraphHoist<'ctx, 'env, 'heap> {
    pub fn new(context: &'ctx HirContext<'env, 'heap>) -> Self {
        Self {
            context,
            lifted: Vec::new(),
        }
    }
}

impl<'ctx, 'env, 'heap> Fold<'heap> for GraphHoist<'ctx, 'env, 'heap> {
    type NestedFilter = crate::fold::nested::Deep;
    type Output<T>
        = Result<T, !>
    where
        T: 'heap;
    type Residual = Result<Infallible, !>;

    fn interner(&self) -> &Interner<'heap> {
        self.context.interner
    }

    fn fold_closure(
        &mut self,
        Closure { signature, body }: Closure<'heap>,
    ) -> Self::Output<Closure<'heap>> {
        let mut dependent = MixedBitSet::new_empty(self.context.counter.var.size());

        for param in signature.params {
            dependent.insert(param.name.id);
        }

        // The body should be in ANF, meaning that the first node is either a let binding, or an
        // anf_atom
        let body = match body.kind {
            NodeKind::Let(Let { bindings, body }) => {
                let mut actual = Vec::new();

                // TODO: recycler (move into own type)
                let mut outer = core::mem::take(&mut self.lifted);

                for &Binding {
                    span,
                    binder,
                    value,
                } in bindings
                {
                    // TODO: recycler
                    let mut deps = VariableDependencies::new(self.context);
                    deps.visit_node(&value);
                    let mut deps = deps.finish();

                    // TODO: walk and drain lifted, here it's important that we ensure that we
                    // continue to lift (if we can) <- this logically means that we need to properly
                    // encapsulate the logic using a worklist

                    if deps.intersect(&dependent) {
                        // There were variables mentioned in the body that are dependent on the
                        // closure's parameters
                        dependent.insert(binder.id);
                        actual.push(Binding {
                            span,
                            binder,
                            value,
                        });
                    } else {
                        // No variable dependencies, therefore safe to lift
                        outer.push(Binding {
                            span,
                            binder,
                            value,
                        });
                    }
                }

                todo!()
            }
            _ => {
                debug_assert!(is_anf_atom(&body), "Body must be an ANF atom");

                body
            }
        };

        todo!()
    }
}

fn work_boundary<'heap>(
    upper: &mut Vec<Binding<'heap>>,
    current_scope: &mut Vec<Binding<'heap>>,
    bindings: &[Binding<'heap>],
    infected: &mut MixedBitSet<VarId>,
) {
    for &binding in bindings {
        let Binding {
            span,
            binder,
            value,
        } = binding;

        // TODO: walk_bindings to get current bindings in the new scope, then decide if the new
        // scope has the variables we require
        let mut scope = Vec::new();

        scope.push(binding);
        for binding in scope.drain(..) {
            let mut deps = VariableDependencies::new(/* TODO */);
            deps.visit_node(&value);
            let mut deps = deps.finish();

            // We have a binding that belongs to the current scope
            if deps.intersect(&infected) {
                infected.insert(binder.id);
                current_scope.push(binding);
            } else {
                // There are no references to the variables in the current scope
                upper.push(binding);
            }
        }
    }
}
