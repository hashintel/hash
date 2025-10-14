use core::convert::Infallible;

use crate::{
    context::HirContext,
    fold::{self, Fold, nested::Deep},
    intern::Interner,
    lower::normalization::is_anf_atom,
    node::{
        Node, PartialNode,
        call::{Call, PointerKind},
        kind::NodeKind,
        r#let::{Let, VarIdSet},
        variable::{LocalVariable, QualifiedVariable, Variable},
    },
};

pub struct Thunking<'ctx, 'env, 'heap> {
    context: &'ctx HirContext<'env, 'heap>,
    thunked: VarIdSet,
    current_node: Option<Node<'heap>>,
    trampoline: Option<Node<'heap>>,
}

impl<'ctx, 'env, 'heap> Thunking<'ctx, 'env, 'heap> {
    pub fn new(context: &'ctx HirContext<'env, 'heap>) -> Self {
        Self {
            context,
            thunked: VarIdSet::default(),
            current_node: None,
            trampoline: None,
        }
    }

    pub fn run(mut self, node: Node<'heap>) -> Node<'heap> {
        // First collect all the variables that need to be thunked, these are simply the top level
        // let-bindings, we know that the top level are let bindings, because we expect everything
        // to be in HIR(ANF).
        let NodeKind::Let(Let { bindings, body }) = &node.kind else {
            // Ensure that the underlying node is an atom, if it isn't -> we're not being called
            // from HIR(ANF)
            debug_assert!(is_anf_atom(&node), "The HIR is not in ANF");

            // otherwise we simply have no bindings to thunk
            return node;
        };

        // TODO: the return value of a module must be... nothing? but then how do we know what to
        // call?
        // because let's say the output is:
        // `fn() -> 12`, then we would say:
        // `let %1 = fn() -> 12 in %1`
        // we then thunk, so we'd get:
        // `let %1 = thunk(() -> fn() -> 12) in %1()`, which then would mean we got:
        // `let %1 = thunk(() -> fn() -> 12), %2 = thunk(() -> %1()) in %2()`.
        // This is an endless loop, we can fix this by just always thunking the body, then returning
        // a thunk, OR(!) we say that the export value must always be `()` <- maybe because `export`
        // already ran.
        // Then how does that work for eval? We could just say that if you export something, it's
        // always just exported as `main` or something like that?

        // Ensure that the underlying node is an atom, if it isn't -> we're not being called
        // from HIR(ANF)
        debug_assert!(is_anf_atom(body), "The HIR is not in ANF");

        // When thunking, do not double thunk
        self.thunked.extend(
            bindings
                .iter()
                .filter(|binding| !matches!(binding.value.kind, NodeKind::Thunk(_)))
                .map(|binding| binding.binder.id),
        );

        // TODO: the value always returned should be a thunk, in the future we can lift the
        // restriction once we properly handle entrypoints.

        // We do not touch the body of the `let` (the atom), meaning we just always return a thunk
        // or a primitive value.

        let Ok(node) = self.fold_node(node); // TODO: fold_bindings

        // Check if the underlying node already refers to a thunk (such as a re-export or any
        // binding). If that is the case we can skip the next step (of explicit thunking), otherwise
        // we need to create a thunk and reference it.

        // the body is still an atom

        node
    }

    #[inline]
    fn current_node(&self) -> Node<'heap> {
        self.current_node.unwrap_or_else(|| {
            unreachable!("current_node is only called in `fold_node` and should be always set")
        })
    }

    fn trampoline(&mut self, node: Node<'heap>) {
        match &mut self.trampoline {
            None => {
                self.trampoline = Some(node);
            }
            Some(_) => {
                panic!("trampoline has been inserted to multiple times");
            }
        }
    }
}

impl<'heap> Fold<'heap> for Thunking<'_, '_, 'heap> {
    type NestedFilter = Deep;
    type Output<T>
        = Result<T, !>
    where
        T: 'heap;
    type Residual = Result<Infallible, !>;

    fn interner(&self) -> &Interner<'heap> {
        self.context.interner
    }

    fn fold_node(&mut self, node: Node<'heap>) -> Self::Output<Node<'heap>> {
        let backup_trampoline = self.trampoline.take();
        let backup_current_node = self.current_node.take();

        let Ok(mut node) = fold::walk_node(self, node);

        let trampoline = core::mem::replace(&mut self.trampoline, backup_trampoline);
        let current_node = core::mem::replace(&mut self.current_node, backup_current_node);
        if let Some(trampoline) = trampoline {
            node = trampoline;
        }
        if let Some(current_node) = current_node {
            self.current_node = Some(current_node);
        }

        Ok(node)
    }

    fn fold_local_variable(
        &mut self,
        variable: LocalVariable<'heap>,
    ) -> Self::Output<LocalVariable<'heap>> {
        let Ok(variable) = fold::walk_local_variable(self, variable);

        if !self.thunked.contains(&variable.id.value) {
            return Ok(variable);
        }

        self.trampoline(self.context.interner.intern_node(PartialNode {
            span: self.current_node().span,
            kind: NodeKind::Call(Call {
                kind: PointerKind::Thin,
                function: self.current_node(),
                arguments: self.context.interner.intern_call_arguments(&[]),
            }),
        }));

        // Return the same variable, so that the caller interning does not do extra work
        Ok(variable)
    }

    fn fold_qualified_variable(
        &mut self,
        variable: QualifiedVariable<'heap>,
    ) -> Self::Output<QualifiedVariable<'heap>> {
        let Ok(variable) = fold::walk_qualified_variable(self, variable);

        // `fold_call` ensures that this is not yet a thunked call
        self.trampoline(self.context.interner.intern_node(PartialNode {
            span: self.current_node().span,
            kind: NodeKind::Call(Call {
                kind: PointerKind::Thin,
                function: self.current_node(),
                arguments: self.context.interner.intern_call_arguments(&[]),
            }),
        }));

        // Return the same variable, so that the caller interning does not do extra work
        Ok(variable)
    }

    fn fold_call(&mut self, call: Call<'heap>) -> Self::Output<Call<'heap>> {
        // Check if we already call a thunked function when it is a qualified variable, if that is
        // the case this is just a no-op
        if let NodeKind::Variable(Variable::Qualified(_)) = call.function.kind
            && call.kind == PointerKind::Thin
        {
            return Ok(call);
        }

        fold::walk_call(self, call)
    }
}
