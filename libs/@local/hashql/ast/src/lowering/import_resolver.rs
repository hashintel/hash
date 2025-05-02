use hashql_core::{
    heap::Heap,
    module::namespace::{ImportOptions, ModuleNamespace},
};

use crate::{
    node::expr::{UseExpr, r#use::UseKind},
    visit::Visitor,
};

pub struct ImportResolver<'env, 'heap> {
    heap: &'heap Heap,
    namespace: ModuleNamespace<'env, 'heap>,
}

impl<'env, 'heap> ImportResolver<'env, 'heap> {}

impl<'env, 'heap> Visitor<'heap> for ImportResolver<'env, 'heap> {
    fn visit_use_expr(
        &mut self,
        UseExpr {
            id,
            span,
            path,
            kind,
            body,
        }: &mut UseExpr<'heap>,
    ) {
        let mut query = Vec::with_capacity(path.segments.len());

        // We'll replace ourselves with the body once walked, therefore save to drain
        for segment in path.segments.drain(..) {
            if segment.arguments.is_empty() {
                query.push(segment.name.value.intern(self.heap));
            } else {
                todo!("record diagnostic")
            }
        }

        let imports = match kind {
            UseKind::Named(use_bindings) => {
                // TODO:
                true
            }
            UseKind::Glob(_) => {
                if path.rooted {
                    self.namespace.import_absolute(
                        self.heap.intern_symbol("*"),
                        query.iter().copied(),
                        ImportOptions { glob: true },
                    )
                } else {
                    self.namespace.import_relative(
                        self.heap.intern_symbol("*"),
                        query.iter().copied(),
                        ImportOptions { glob: true },
                    )
                }
            }
        };

        // })
    }
}
