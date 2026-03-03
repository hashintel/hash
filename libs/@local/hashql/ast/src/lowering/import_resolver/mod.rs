pub mod error;

use core::{iter, mem};

use hashql_core::{
    heap::Heap,
    module::{
        Reference, Universe,
        error::ResolutionError,
        namespace::{ImportOptions, ModuleNamespace, ResolutionMode, ResolveOptions},
    },
    symbol::{Ident, IdentKind, Symbol},
};
use hashql_diagnostics::DiagnosticIssues;

use self::error::{
    ImportResolverDiagnosticIssues, empty_path, from_resolution_error, generic_arguments_in_module,
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

pub struct ImportResolver<'env, 'heap> {
    heap: &'heap Heap,
    namespace: ModuleNamespace<'env, 'heap>,
    current_universe: Universe,
    diagnostics: ImportResolverDiagnosticIssues,
    handled_diagnostics: usize,
}

impl<'env, 'heap> ImportResolver<'env, 'heap> {
    pub const fn new(heap: &'heap Heap, namespace: ModuleNamespace<'env, 'heap>) -> Self {
        Self {
            heap,
            namespace,
            current_universe: Universe::Value,
            diagnostics: DiagnosticIssues::new(),
            handled_diagnostics: 0,
        }
    }

    pub fn take_diagnostics(&mut self) -> ImportResolverDiagnosticIssues {
        mem::take(&mut self.diagnostics)
    }

    const fn critical_diagnostics_count(&self) -> usize {
        self.diagnostics.critical()
    }

    fn enter<T>(
        &mut self,
        universe: Universe,
        symbol: Symbol<'heap>,
        closure: impl FnOnce(&mut Self) -> T,
    ) -> T {
        let snapshot = self.namespace.snapshot();
        self.namespace.local(symbol, universe);

        let result = closure(self);

        self.namespace.rollback_to(snapshot);

        result
    }

    fn enter_many<T>(
        &mut self,
        universe: Universe,
        symbols: impl IntoIterator<Item = Symbol<'heap>>,
        closure: impl FnOnce(&mut Self) -> T,
    ) -> T {
        let snapshot = self.namespace.snapshot();
        for symbol in symbols {
            self.namespace.local(symbol, universe);
        }

        let result = closure(self);

        self.namespace.rollback_to(snapshot);

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
                    self.diagnostics
                        .push(from_resolution_error(Some(*span), path, None, error));

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

        let reference = match self.namespace.resolve(
            segments,
            ResolveOptions {
                mode,
                universe: self.current_universe,
            },
        ) {
            Ok(item) => item,
            Err(ResolutionError::ImportNotFound {
                depth: _,
                name: _,
                suggestions,
            }) if modules.is_empty() => {
                self.diagnostics.push(unresolved_variable(
                    self.namespace.registry(),
                    self.current_universe,
                    ident.name,
                    &self.namespace.locals(self.current_universe),
                    suggestions,
                ));

                walk_path(self, path);
                return;
            }
            Err(error) => {
                self.diagnostics
                    .push(from_resolution_error(None, path, None, error));

                walk_path(self, path);
                return;
            }
        };

        let item = match reference {
            Reference::Binding(_) => {
                walk_path(self, path);
                return;
            }
            Reference::Item(item) => item,
        };

        let segments: Vec<_> = item.absolute_path(self.namespace.registry()).collect();

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
                    arguments: Vec::new_in(self.heap),
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
                let fatal = self.critical_diagnostics_count();
                if self.handled_diagnostics < fatal {
                    *kind = ExprKind::Dummy;
                    self.handled_diagnostics = fatal;
                }
            }
            ExprKind::Call(_)
            | ExprKind::Struct(_)
            | ExprKind::Dict(_)
            | ExprKind::Tuple(_)
            | ExprKind::List(_)
            | ExprKind::Literal(_)
            | ExprKind::Let(_)
            | ExprKind::Type(_)
            | ExprKind::NewType(_)
            | ExprKind::Input(_)
            | ExprKind::Closure(_)
            | ExprKind::If(_)
            | ExprKind::Field(_)
            | ExprKind::Index(_)
            | ExprKind::As(_)
            | ExprKind::Underscore
            | ExprKind::Dummy => {}
        }
    }

    fn visit_type(&mut self, r#type: &mut Type<'heap>) {
        let previous = self.current_universe;

        self.current_universe = Universe::Type;
        walk_type(self, r#type);
        self.current_universe = previous;

        // Replace any path, which has had diagnostics emitted with a dummy expression
        if matches!(r#type.kind, TypeKind::Path(_)) {
            let fatal = self.critical_diagnostics_count();
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
