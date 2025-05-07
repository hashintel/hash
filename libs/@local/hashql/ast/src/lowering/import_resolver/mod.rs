pub mod error;

use core::{iter, mem};

use hashql_core::{
    collection::FastHashSet,
    heap::Heap,
    module::{
        error::ResolutionError,
        item::Universe,
        namespace::{ImportOptions, ModuleNamespace, ResolutionMode, ResolveOptions},
    },
    symbol::{Ident, IdentKind, Symbol},
};

use self::error::{
    ImportResolverDiagnostic, empty_path, from_resolution_error, generic_arguments_in_module,
    generic_arguments_in_use_path, unresolved_variable,
};
use super::super::node::path::PathSegmentArgument;
use crate::{
    node::{
        expr::{
            ClosureExpr, Expr, ExprKind, LetExpr, NewTypeExpr, TypeExpr, UseExpr,
            r#use::{UseBinding, UseKind},
        },
        id::NodeId,
        path::{Path, PathSegment},
        r#type::{Type, TypeKind},
    },
    visit::{Visitor, walk_closure_expr, walk_expr, walk_path, walk_type},
};

#[derive(Debug, Default)]
struct Scope<'heap> {
    value: FastHashSet<Symbol<'heap>>,
    r#type: FastHashSet<Symbol<'heap>>,
}

impl<'heap> Scope<'heap> {
    fn contains(&self, universe: Universe, name: Symbol<'heap>) -> bool {
        let inner = match universe {
            Universe::Type => &self.r#type,
            Universe::Value => &self.value,
        };

        inner.contains(&name)
    }

    fn insert(&mut self, universe: Universe, name: Symbol<'heap>) -> bool {
        match universe {
            Universe::Type => self.r#type.insert(name),
            Universe::Value => self.value.insert(name),
        }
    }

    fn remove(&mut self, universe: Universe, name: Symbol<'heap>) -> bool {
        match universe {
            Universe::Type => self.r#type.remove(&name),
            Universe::Value => self.value.remove(&name),
        }
    }
}

pub struct ImportResolver<'env, 'heap> {
    heap: &'heap Heap,
    namespace: ModuleNamespace<'env, 'heap>,
    current_universe: Universe,
    scope: Scope<'heap>,
    diagnostics: Vec<ImportResolverDiagnostic>,
    handled_diagnostics: usize,
}

impl<'env, 'heap> ImportResolver<'env, 'heap> {
    pub fn new(heap: &'heap Heap, namespace: ModuleNamespace<'env, 'heap>) -> Self {
        Self {
            heap,
            namespace,
            current_universe: Universe::Value,
            scope: Scope::default(),
            diagnostics: Vec::new(),
            handled_diagnostics: 0,
        }
    }

    pub fn take_diagnostics(&mut self) -> Vec<ImportResolverDiagnostic> {
        mem::take(&mut self.diagnostics)
    }

    fn fatal_diagnostics(&self) -> usize {
        self.diagnostics
            .iter()
            .filter(|diagnostic| diagnostic.severity.is_fatal())
            .count()
    }

    fn enter<T>(
        &mut self,
        universe: Universe,
        symbol: Symbol<'heap>,
        closure: impl FnOnce(&mut Self) -> T,
    ) -> T {
        let remove = self.scope.insert(universe, symbol);

        let result = closure(self);

        if remove {
            self.scope.remove(universe, symbol);
        }

        result
    }

    fn enter_many<T>(
        &mut self,
        universe: Universe,
        symbols: impl IntoIterator<Item = Symbol<'heap>>,
        closure: impl FnOnce(&mut Self) -> T,
    ) -> T {
        let remove: Vec<_> = symbols
            .into_iter()
            .filter(|&symbol| self.scope.insert(universe, symbol))
            .collect();

        let result = closure(self);

        for symbol in remove {
            self.scope.remove(universe, symbol);
        }

        result
    }
}

impl<'heap> Visitor<'heap> for ImportResolver<'_, 'heap> {
    fn visit_use_expr(
        &mut self,
        UseExpr {
            id: _,
            span,
            path,
            kind,
            body,
        }: &mut UseExpr<'heap>,
    ) {
        // We don't need to walk the path here, because the import resolution already does the
        // normalization for us
        let mut query = Vec::with_capacity(path.segments.len());

        for segment in &path.segments {
            if !segment.arguments.is_empty() {
                self.diagnostics
                    .push(generic_arguments_in_use_path(segment.span, *span));
            }

            query.push(segment.name.value);
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
                    let alias = alias.map_or(name.value, |alias| alias.value);

                    let result = self.namespace.import(
                        alias,
                        query.iter().copied().chain(iter::once(name.value)),
                        ImportOptions {
                            glob: false,
                            mode,
                            suggestions: true,
                        },
                    );

                    if let Err(error) = result {
                        self.diagnostics.push(from_resolution_error(
                            Some(*span),
                            self.namespace.registry,
                            path,
                            Some((name.span, name.value)),
                            error,
                        ));

                        // We cannot continue here, so we replace the body with `Dummy`, this way we
                        // can still report the error and continue in the control flow
                        **body = Expr::dummy();
                    }
                }
            }
            UseKind::Glob(_) => {
                let result = self.namespace.import(
                    self.heap.intern_symbol("*"),
                    query.iter().copied(),
                    ImportOptions {
                        glob: true,
                        mode,
                        suggestions: true,
                    },
                );

                if let Err(error) = result {
                    self.diagnostics.push(from_resolution_error(
                        Some(*span),
                        self.namespace.registry,
                        path,
                        None,
                        error,
                    ));

                    // We cannot continue here, so we replace the body with `Dummy`, this way we
                    // can still report the error and continue in the control flow
                    **body = Expr::dummy();
                }
            }
        }

        self.visit_expr(body);

        self.namespace.rollback_to(snapshot);
    }

    fn visit_path(&mut self, path: &mut Path<'heap>) {
        let [modules @ .., ident] = &*path.segments else {
            self.diagnostics.push(empty_path(path.span));
            return;
        };

        if modules.is_empty() && self.scope.contains(self.current_universe, ident.name.value) {
            // We do not need to look this up, because it's already in scope as an identifier
            walk_path(self, path);
            return;
        }

        // We don't support generics except for the *last* segment
        let mut should_continue = true;
        for module in modules {
            if !module.arguments.is_empty() {
                self.diagnostics.push(generic_arguments_in_module(
                    module.arguments.iter().map(PathSegmentArgument::span),
                ));

                should_continue = false;
            }
        }

        if !should_continue {
            // While in theory we could continue processing here, the problem would be that any
            // generic parameter would double emit errors, which adds additional visual noise.
            return;
        }

        let segments = path.segments.iter().map(|segment| segment.name.value);

        let mode = if path.rooted {
            ResolutionMode::Absolute
        } else {
            ResolutionMode::Relative
        };

        let item = match self.namespace.resolve(
            segments,
            ResolveOptions {
                mode,
                universe: self.current_universe,
            },
        ) {
            Ok(item) => item,
            Err(ResolutionError::ImportNotFound {
                depth: _,
                suggestions,
            }) if modules.is_empty() => {
                self.diagnostics.push(unresolved_variable(
                    self.namespace.registry,
                    self.current_universe,
                    ident.name,
                    match self.current_universe {
                        Universe::Type => &self.scope.r#type,
                        Universe::Value => &self.scope.value,
                    },
                    suggestions,
                ));

                walk_path(self, path);
                return;
            }
            Err(error) => {
                self.diagnostics.push(from_resolution_error(
                    None,
                    self.namespace.registry,
                    path,
                    None,
                    error,
                ));

                walk_path(self, path);
                return;
            }
        };

        let segments: Vec<_> = item.absolute_path(self.namespace.registry).collect();

        // The trailing segments might not be the same due to renames, reset the symbol to the
        // canonical form (but retain the span)
        debug_assert!(segments.len() >= path.segments.len());

        // For the trailing segments, set the name to the canonical name (they might be renamed)
        for (&lhs, rhs) in segments[segments.len() - path.segments.len()..]
            .iter()
            .zip(&mut path.segments)
        {
            rhs.name.value = lhs;
        }

        let span = path.segments.first().unwrap_or_else(|| unreachable!()).span;

        path.rooted = true;
        path.segments.splice(
            0..0,
            segments[..segments.len() - path.segments.len()]
                .iter()
                .map(|&ident| PathSegment {
                    id: NodeId::PLACEHOLDER,
                    span,
                    name: Ident {
                        span,
                        value: ident,
                        kind: IdentKind::Lexical,
                    },
                    arguments: self.heap.vec(None),
                }),
        );

        walk_path(self, path);
    }

    fn visit_expr(&mut self, expr: &mut Expr<'heap>) {
        // Process the node first
        walk_expr(self, expr);

        match &mut expr.kind {
            // Replace any use statement with it's body
            ExprKind::Use(use_expr) => {
                let inner = mem::replace(&mut *use_expr.body, Expr::dummy());
                *expr = inner;
            }
            // Replace any path, which has had diagnostics emitted with a dummy expression
            kind @ ExprKind::Path(_) => {
                let fatal = self.fatal_diagnostics();
                if self.handled_diagnostics < fatal {
                    *kind = ExprKind::Dummy;
                    self.handled_diagnostics = fatal;
                }
            }
            _ => {}
        }
    }

    fn visit_type(&mut self, r#type: &mut Type<'heap>) {
        let previous = self.current_universe;

        self.current_universe = Universe::Type;
        walk_type(self, r#type);
        self.current_universe = previous;

        // Replace any path, which has had diagnostics emitted with a dummy expression
        if matches!(r#type.kind, TypeKind::Path(_)) {
            let fatal = self.fatal_diagnostics();
            if self.handled_diagnostics < fatal {
                r#type.kind = TypeKind::Dummy;
                self.handled_diagnostics = fatal;
            }
        }
    }

    fn visit_let_expr(
        &mut self,
        LetExpr {
            id,
            span,
            name,
            value,
            r#type,
            body,
        }: &mut LetExpr<'heap>,
    ) {
        self.visit_id(id);
        self.visit_span(span);
        self.visit_ident(name);

        // Important: The scope only effect in the body, not in the value, as that would allow the
        // creation of recursive values
        self.visit_expr(value);

        if let Some(r#type) = r#type {
            self.visit_type(r#type);
        }

        self.enter(Universe::Value, name.value, |this| {
            this.visit_expr(body);
        });
    }

    fn visit_type_expr(
        &mut self,
        TypeExpr {
            id,
            span,
            name,
            constraints,
            value,
            body,
        }: &mut TypeExpr<'heap>,
    ) {
        self.visit_id(id);
        self.visit_span(span);
        self.visit_ident(name);

        self.enter(Universe::Type, name.value, |this| {
            let constraint_symbols: Vec<_> = constraints
                .iter()
                .map(|constraint| constraint.name.value)
                .collect();

            // Constraints are mentioned in the type value, as well as the constraints themselves,
            // while the type outlines the value and is bound in the body as well.
            this.enter_many(Universe::Type, constraint_symbols, |this| {
                for constraint in constraints {
                    this.visit_generic_constraint(constraint);
                }

                this.visit_type(value);
            });

            this.visit_expr(body);
        });
    }

    fn visit_newtype_expr(
        &mut self,
        NewTypeExpr {
            id,
            span,
            name,
            constraints,
            value,
            body,
        }: &mut NewTypeExpr<'heap>,
    ) {
        self.visit_id(id);
        self.visit_span(span);
        self.visit_ident(name);

        self.enter(Universe::Type, name.value, |this| {
            let constraint_symbols: Vec<_> = constraints
                .iter()
                .map(|constraint| constraint.name.value)
                .collect();

            // Constraints are mentioned in the type value, as well as the constraints themselves,
            // while the type outlines the value and is bound in the body as well.
            this.enter_many(Universe::Type, constraint_symbols, |this| {
                for constraint in constraints {
                    this.visit_generic_constraint(constraint);
                }

                this.visit_type(value);
            });

            // Unlike types, newtypes (opaque types) also bring into scope (only in the body)
            // themselves as a constructor
            this.enter(Universe::Value, name.value, |this| {
                this.visit_expr(body);
            });
        });
    }

    fn visit_closure_expr(&mut self, expr: &mut ClosureExpr<'heap>) {
        let generic_symbols: Vec<_> = expr
            .signature
            .generics
            .params
            .iter()
            .map(|param| param.name.value)
            .collect();

        let param_symbols: Vec<_> = expr
            .signature
            .inputs
            .iter()
            .map(|input| input.name.value)
            .collect();

        self.enter_many(Universe::Type, generic_symbols, |this| {
            this.enter_many(Universe::Value, param_symbols, |this| {
                walk_closure_expr(this, expr);
            });
        });
    }
}
