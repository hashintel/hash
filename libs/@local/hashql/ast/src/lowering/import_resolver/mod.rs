pub mod error;

use core::{iter, mem};

use hashql_core::{
    collection::FastHashSet,
    heap::Heap,
    module::{
        item::Universe,
        namespace::{ImportOptions, ModuleNamespace, ResolutionMode, ResolveOptions},
    },
    symbol::{Ident, IdentKind, InternedSymbol, Symbol},
};

use self::error::{
    ImportResolverDiagnostic, empty_path, generic_arguments_in_module,
    generic_arguments_in_use_path,
};
use crate::{
    node::{
        expr::{
            Expr, ExprKind, UseExpr,
            r#use::{UseBinding, UseKind},
        },
        id::NodeId,
        path::{Path, PathSegment},
        r#type::Type,
    },
    visit::{Visitor, walk_expr, walk_type},
};

#[derive(Debug, Default)]
struct Scope<'heap> {
    value: FastHashSet<InternedSymbol<'heap>>,
    r#type: FastHashSet<InternedSymbol<'heap>>,
}

impl<'heap> Scope<'heap> {
    fn contains(&self, universe: Universe, name: InternedSymbol<'heap>) -> bool {
        let inner = match universe {
            Universe::Type => &self.r#type,
            Universe::Value => &self.value,
        };

        inner.contains(&name)
    }
}

pub struct ImportResolver<'env, 'heap> {
    heap: &'heap Heap,
    namespace: ModuleNamespace<'env, 'heap>,
    current_universe: Universe,
    scope: Scope<'heap>,
    diagnostics: Vec<ImportResolverDiagnostic>,
}

impl<'env, 'heap> ImportResolver<'env, 'heap> {
    pub fn new(heap: &'heap Heap, namespace: ModuleNamespace<'env, 'heap>) -> Self {
        Self {
            heap,
            namespace,
            current_universe: Universe::Value,
            scope: Scope::default(),
            diagnostics: Vec::new(),
        }
    }

    pub fn take_diagnostics(&mut self) -> Vec<ImportResolverDiagnostic> {
        mem::take(&mut self.diagnostics)
    }
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
            if !segment.arguments.is_empty() {
                self.diagnostics
                    .push(generic_arguments_in_use_path(segment.span));
            }

            query.push(segment.name.value.intern(self.heap));
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
        // We don't support generics except for the *last* segment
        let [modules @ .., ident] = &*path.segments else {
            self.diagnostics.push(empty_path(path.span));
            return;
        };

        if modules.is_empty()
            && self
                .scope
                .contains(self.current_universe, ident.name.value.intern(self.heap))
        {
            // We do not need to look this up, because it's already in scope as an identifier
            return;
        }

        for module in modules {
            if !module.arguments.is_empty() {
                self.diagnostics
                    .push(generic_arguments_in_module(module.span));
            }
        }

        let segments = path
            .segments
            .iter()
            .map(|segment| segment.name.value.intern(self.heap));

        let mode = if path.rooted {
            ResolutionMode::Absolute
        } else {
            ResolutionMode::Relative
        };

        let Some(item) = self.namespace.resolve(
            segments,
            ResolveOptions {
                mode,
                universe: self.current_universe,
            },
        ) else {
            todo!("record diagnostic")
        };

        let mut segments: Vec<_> = item.absolute_path(self.namespace.registry).collect();

        // Ensure that the last n segments are the same, this should always be the case, so this
        // is only a sanity check under debug assertions.
        debug_assert!(segments.len() >= path.segments.len());
        if cfg!(debug_assertions) {
            let length = path.segments.len();
            for (lhs, rhs) in segments[segments.len() - length..]
                .iter()
                .zip(&path.segments)
            {
                assert_eq!(*lhs, rhs.name.value.intern(self.heap));
            }
        }

        let span = path.segments.first().unwrap_or_else(|| unreachable!()).span;
        segments.truncate(segments.len() - path.segments.len());

        path.segments.splice(
            0..0,
            segments.into_iter().map(|ident| PathSegment {
                id: NodeId::PLACEHOLDER,
                span,
                name: Ident {
                    span,
                    value: Symbol::new(ident),
                    kind: IdentKind::Lexical,
                },
                arguments: self.heap.vec(None),
            }),
        );
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

    fn visit_type(&mut self, r#type: &mut Type<'heap>) {
        let previous = self.current_universe;

        self.current_universe = Universe::Type;
        walk_type(self, r#type);
        self.current_universe = previous;
    }
}
