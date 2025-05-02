use core::{iter, mem};

use hashql_core::{
    heap::Heap,
    module::namespace::{ResolutionMode, ImportOptions, ModuleNamespace},
};

use crate::{
    node::{
        expr::{
            Expr, ExprKind, UseExpr,
            r#use::{UseBinding, UseKind},
        },
        path::Path,
    },
    visit::{Visitor, walk_expr},
};

pub struct ImportResolver<'env, 'heap> {
    heap: &'heap Heap,
    namespace: ModuleNamespace<'env, 'heap>,
}

impl<'heap> Visitor<'heap> for ImportResolver<'_, 'heap> {
    fn visit_use_expr(
        &mut self,
        UseExpr {
            id: _,
            span: _,
            path,
            kind,
            body,
        }: &mut UseExpr<'heap>,
    ) {
        // We don't need to walk the path here, because the import resolution already does the
        // normalization for us

        let mut query = Vec::with_capacity(path.segments.len());

        // We'll replace ourselves with the body once walked, therefore save to drain
        for segment in path.segments.drain(..) {
            if segment.arguments.is_empty() {
                query.push(segment.name.value.intern(self.heap));
            } else {
                todo!("record diagnostic")
            }
        }

        let mode = if path.rooted {
            ResolutionMode::Absolute
        } else {
            ResolutionMode::Relative
        };

        let snapshot = self.namespace.snapshot();

        match kind {
            UseKind::Named(use_bindings) => {
                for UseBinding {
                    id: _,
                    span: _,
                    name,
                    alias,
                } in use_bindings.drain(..)
                {
                    let name = name.value.intern(self.heap);
                    let alias = alias.map_or(name, |alias| alias.value.intern(self.heap));

                    let success = self.namespace.import(
                        alias,
                        query.iter().copied().chain(iter::once(name)),
                        ImportOptions { glob: false, mode },
                    );

                    if !success {
                        todo!("record diagnostic")
                    }
                }
            }
            UseKind::Glob(_) => {
                let success = self.namespace.import(
                    self.heap.intern_symbol("*"),
                    query.iter().copied(),
                    ImportOptions { glob: true, mode },
                );

                if !success {
                    todo!("record diagnostic")
                }
            }
        }

        self.visit_expr(body);

        self.namespace.rollback_to(snapshot);
    }

    fn visit_path(&mut self, path: &mut Path<'heap>) {
        self.namespace.resolve_name(name, universe)

        todo!()
    }

    fn visit_expr(&mut self, expr: &mut Expr<'heap>) {
        // Process the node first
        walk_expr(self, expr);

        // Replace any use statement with it's body
        let ExprKind::Use(use_expr) = &mut expr.kind else {
            return;
        };

        let inner = mem::replace(&mut *use_expr.body, Expr::dummy());
        *expr = inner;
    }
}
