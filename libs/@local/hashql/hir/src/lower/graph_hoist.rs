use crate::{context::HirContext, node::r#let::VarIdUnionFind};

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
    unify: VarIdUnionFind,
}

impl<'ctx, 'env, 'heap> GraphHoist<'ctx, 'env, 'heap> {
    pub fn new(context: &'ctx HirContext<'env, 'heap>) -> Self {
        Self {
            context,
            unify: VarIdUnionFind::new(context.counter.var.size()),
        }
    }
}
