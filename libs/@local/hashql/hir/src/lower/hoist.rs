use core::{convert::Infallible, mem};

use hashql_core::{
    collections::pool::{MixedBitSetPool, MixedBitSetRecycler, VecPool},
    id::bit_vec::{BitRelations as _, MixedBitSet},
    intern::Interned,
};

use crate::{
    context::HirContext,
    fold::{self, Fold},
    intern::Interner,
    lower::dataflow::VariableDependencies,
    node::{
        Node,
        closure::Closure,
        graph::Graph,
        r#let::{Binding, VarId},
    },
    visit::Visitor as _,
};

// Graph hoisting does not break HIR(ANF)

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

#[derive(Debug, Copy, Clone)]
pub struct GraphHoistingConfig {
    pub bitset_recycler_capacity: usize,
    pub binding_recycler_capacity: usize,
}

impl Default for GraphHoistingConfig {
    fn default() -> Self {
        Self {
            bitset_recycler_capacity: 8,
            binding_recycler_capacity: 4,
        }
    }
}

pub struct GraphHoisting<'ctx, 'env, 'heap> {
    context: &'ctx HirContext<'env, 'heap>,
    scope: Vec<Binding<'heap>>,
    nested_inside_graph: bool,
    scope_sources: Option<MixedBitSet<VarId>>,

    binding_pool: VecPool<Binding<'heap>>,
    bitset_pool: MixedBitSetPool<VarId>,
}

impl<'ctx, 'env, 'heap> GraphHoisting<'ctx, 'env, 'heap> {
    #[must_use]
    pub fn new(context: &'ctx HirContext<'env, 'heap>, config: GraphHoistingConfig) -> Self {
        Self {
            context,
            scope: Vec::new(),
            nested_inside_graph: false,
            scope_sources: None,
            binding_pool: VecPool::new(config.binding_recycler_capacity),
            bitset_pool: MixedBitSetPool::with_recycler(
                config.bitset_recycler_capacity,
                MixedBitSetRecycler {
                    domain_size: context.counter.var.size(),
                },
            ),
        }
    }

    #[must_use]
    pub fn run(mut self, node: Node<'heap>) -> Node<'heap> {
        let Ok(node) = self.fold_node(node);

        debug_assert!(
            self.scope.is_empty(),
            "The scope should have been emptied when traversing the tree"
        );
        debug_assert!(
            self.scope_sources.is_none(),
            "The scope sources should have been restored after traversing the tree"
        );

        node
    }
}

impl<'heap> Fold<'heap> for GraphHoisting<'_, '_, 'heap> {
    type NestedFilter = crate::fold::nested::Deep;
    type Output<T>
        = Result<T, !>
    where
        T: 'heap;
    type Residual = Result<Infallible, !>;

    fn interner(&self) -> &Interner<'heap> {
        self.context.interner
    }

    // The core insight is that a boundary is always at let's, why? because we always collapse lets
    // when we move to HIR(ANF) where possible. The resulting value is always a value (that of a
    // `let`), therefore at any boundary the lets automatically collect. This also means that we
    // don't need to worry about what is a boundary or not - we just choose to do this at every let,
    // which means it's a boundary.
    //
    // We only want to move things to the upper boundary if we're inside of a let, this gets a bit
    // more tricky.

    fn fold_bindings(
        &mut self,
        bindings: Interned<'heap, [Binding<'heap>]>,
    ) -> Self::Output<Interned<'heap, [Binding<'heap>]>> {
        // We replace the current upper scope with our current scope and operate it, this means that
        // we automatically collect any bindings that are available (if required).
        let mut upper_scope = mem::replace(
            &mut self.scope,
            // We're not hoisting in a large amount of cases, therefore the amount of bindings is
            // actually a pretty good indicator.
            self.binding_pool.acquire_with(bindings.len()),
        );

        // When walking the bindings, make sure that we put our bindings *after* walking, otherwise
        // computation order is wrong.
        for &binding in bindings {
            let Ok(binding) = fold::walk_binding(self, binding);
            self.scope.push(binding);
        }

        // Check if we can upstream any arguments that aren't dependent on the current scope
        let Some(mut scope_sources) = self.scope_sources.take() else {
            let bindings = mem::replace(&mut self.scope, upper_scope);

            // If we're not inside a closure (aka scope_sources is None), we cannot upstream any
            // bindings, so simply act as a collector.
            return Ok(self.context.interner.bindings.intern_slice(&bindings));
        };

        // If we're inside a closure, we can upstream any bindings that are not dependent on the
        // current scope. This is because the closure will capture any variables that are
        // used within it.
        // While doing so we "infect" any bindings that are dependent on the current scope, this is
        // akin to a flattened set of data flow.
        self.scope.retain(|binding| {
            let mut variables = VariableDependencies::from_set(self.bitset_pool.acquire());
            variables.visit_node(&binding.value);
            let mut variables = variables.finish();

            variables.intersect(&scope_sources);

            let output = if variables.is_empty() {
                // There are no dependencies on the declared resources, therefore it is safe to
                // upstream
                upper_scope.push(*binding);
                false
            } else {
                // It is dependent on the current scope, therefore it cannot be upstreamed, infect
                // it
                scope_sources.insert(binding.binder.id);
                true
            };
            self.bitset_pool.release(variables);

            output
        });

        self.bitset_pool.release(scope_sources);

        // There might be cases, in which `bindings` will be empty, this is a non-issue, as they
        // will be deleted once HIR(ANF) runs again.

        // Re-instate the upper scope, and return the bindings
        let bindings = mem::replace(&mut self.scope, upper_scope);
        let interned = self.context.interner.bindings.intern_slice(&bindings);

        self.binding_pool.release(bindings);
        Ok(interned)
    }

    fn fold_graph(&mut self, graph: Graph<'heap>) -> Self::Output<Graph<'heap>> {
        let previous = mem::replace(&mut self.nested_inside_graph, true);
        let Ok(graph) = fold::walk_graph(self, graph);
        self.nested_inside_graph = previous;

        Ok(graph)
    }

    fn fold_closure(&mut self, closure: Closure<'heap>) -> Self::Output<Closure<'heap>> {
        // We do not disable hoisting for nested closures, the reason is simple: given that the
        // closure can only be called inside of a graph context, it means that it will *always* be
        // evaluated by a backend, therefore, we want to move as much out as possible, as that
        // filter may be called multiple times.
        if !self.nested_inside_graph {
            return fold::walk_closure(self, closure);
        }

        let mut params = self.bitset_pool.acquire();
        for param in closure.signature.params {
            params.insert(param.name.id);
        }

        // We're nested inside graph, which means that let-promotion takes place.
        let prev_scope_sources = self.scope_sources.replace(params);

        let Ok(closure) = fold::walk_closure(self, closure);
        self.scope_sources = prev_scope_sources; // We don't particularly care about the return here, it's just used to signal to the body that we can officially hoist

        Ok(closure)
    }
}
