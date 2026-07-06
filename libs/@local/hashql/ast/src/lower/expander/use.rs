use core::{iter, mem};

use hashql_core::{
    collections::fast_hash_map_with_capacity_in,
    heap::BumpAllocator,
    module::namespace::{ImportOptions, ResolutionMode},
    symbol::sym,
};

use super::Expander;
use crate::{
    lower::expander::error,
    node::{
        expr::{
            CallExpr, Expr, ExprKind,
            call::Argument,
            r#use::{self, UseBinding, UseKind},
        },
        id::NodeId,
        path::Path,
    },
};

fn lower_imports_tuple<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,
    tuple: &mut crate::node::expr::TupleExpr<'heap>,
) -> UseKind<'heap> {
    if let Some(annotation) = tuple.r#type.as_ref() {
        expander
            .diagnostics
            .push(error::use_imports_type_annotation(annotation.span));
    }

    let mut bindings = Vec::with_capacity_in(tuple.elements.len(), expander.heap);

    for element in tuple.elements.drain(..) {
        let ExprKind::Path(path) = element.value.kind else {
            expander
                .diagnostics
                .push(error::invalid_use_import_binding(element.value.span));
            continue;
        };

        let Some(name) = path.into_ident() else {
            expander
                .diagnostics
                .push(error::invalid_use_import_binding(element.value.span));
            continue;
        };

        bindings.push(UseBinding {
            id: NodeId::PLACEHOLDER,
            span: element.span,
            name,
            alias: None,
        });
    }

    UseKind::Named(bindings)
}

fn lower_imports_struct<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,
    r#struct: &mut crate::node::expr::StructExpr<'heap>,
) -> UseKind<'heap> {
    if let Some(annotation) = r#struct.r#type.as_ref() {
        expander
            .diagnostics
            .push(error::use_imports_type_annotation(annotation.span));
    }

    let mut bindings = Vec::with_capacity_in(r#struct.entries.len(), expander.heap);

    for entry in r#struct.entries.drain(..) {
        let alias = match &entry.value.kind {
            ExprKind::Underscore => None,
            ExprKind::Path(path) if let Some(&ident) = path.as_ident() => Some(ident),
            ExprKind::Call(_)
            | ExprKind::Struct(_)
            | ExprKind::Dict(_)
            | ExprKind::Tuple(_)
            | ExprKind::List(_)
            | ExprKind::Literal(_)
            | ExprKind::Path(_)
            | ExprKind::Let(_)
            | ExprKind::Type(_)
            | ExprKind::NewType(_)
            | ExprKind::Input(_)
            | ExprKind::Closure(_)
            | ExprKind::If(_)
            | ExprKind::Field(_)
            | ExprKind::Index(_)
            | ExprKind::As(_)
            | ExprKind::Dummy => {
                expander
                    .diagnostics
                    .push(error::invalid_use_alias(entry.value.span));
                None
            }
        };

        bindings.push(UseBinding {
            id: NodeId::PLACEHOLDER,
            span: entry.span,
            name: entry.key,
            alias,
        });
    }

    UseKind::Named(bindings)
}

fn lower_imports<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,

    imports: &mut Argument<'heap>,
) -> Option<UseKind<'heap>>
where
    S: BumpAllocator,
{
    let mut imports = match &mut imports.value.kind {
        ExprKind::Path(path)
            if let Some(&ident) = path.as_ident()
                && ident.value.as_constant() == Some(sym::symbol::asterisk::CONST) =>
        {
            Some(UseKind::Glob(r#use::Glob {
                id: NodeId::PLACEHOLDER,
                span: ident.span,
            }))
        }
        ExprKind::Tuple(tuple) => Some(lower_imports_tuple(expander, tuple)),
        ExprKind::Struct(r#struct) => Some(lower_imports_struct(expander, r#struct)),
        ExprKind::Call(_)
        | ExprKind::Dict(_)
        | ExprKind::List(_)
        | ExprKind::Literal(_)
        | ExprKind::Path(_)
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
        | ExprKind::Dummy => {
            expander
                .diagnostics
                .push(error::invalid_use_imports(imports.value.span));
            None
        }
    };

    if let Some(UseKind::Named(bindings)) = &mut imports {
        let diagnostics = &mut expander.diagnostics;
        expander.scratch.scoped_mut(|scratch| {
            let mut seen = fast_hash_map_with_capacity_in(bindings.len(), scratch);

            bindings.retain(|binding| {
                let effective_name = binding.alias.unwrap_or(binding.name);

                if let Err(occupied) = seen.try_insert(effective_name.value, binding.span) {
                    diagnostics.push(error::duplicate_use_binding(
                        binding.span,
                        effective_name.value,
                        *occupied.entry.get(),
                    ));
                    return false;
                }

                true
            });
        });
    }

    imports
}

fn lower_body<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,
    path: &Path<'heap>,
    imports: UseKind<'heap>,
    body: &mut Argument<'heap>,
) -> Expr<'heap>
where
    S: BumpAllocator,
{
    let mode = if path.rooted {
        ResolutionMode::Absolute
    } else {
        ResolutionMode::Relative
    };
    let query = path.segments.iter().map(|segment| segment.name.value);

    match imports {
        UseKind::Named(use_bindings) => {
            let mut errored = false;

            for UseBinding {
                id: _,
                span: _,
                name,
                alias,
            } in use_bindings
            {
                let alias = alias.map_or(name.value, |alias| alias.value);

                let result = expander.namespace.import(
                    alias,
                    query.clone().chain(iter::once(name.value)),
                    ImportOptions {
                        glob: false,
                        mode,
                        suggestions: true,
                    },
                );

                if let Err(error) = result {
                    expander
                        .diagnostics
                        .push(error::from_import_resolution_error(
                            path,
                            Some(name.symbol()),
                            error,
                        ));

                    errored = true;
                }
            }

            // Visit the body with whatever imports resolved successfully, so references to them
            // don't cascade into spurious unresolved-name diagnostics. Failed bindings already have
            // their own diagnostic from the loop above; the expression is still poisoned below.
            let mut body = mem::replace(&mut body.value, Expr::dummy());
            expander.visit(&mut body);

            if errored {
                return Expr::dummy();
            }

            body
        }
        UseKind::Glob(_) => {
            let result = expander.namespace.import(
                sym::symbol::asterisk,
                query,
                ImportOptions {
                    glob: true,
                    mode,
                    suggestions: true,
                },
            );

            let mut body = mem::replace(&mut body.value, Expr::dummy());
            expander.visit(&mut body);

            if let Err(error) = result {
                expander
                    .diagnostics
                    .push(error::from_import_resolution_error(path, None, error));
                return Expr::dummy();
            }

            body
        }
    }
}

fn lower_use_impl<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,

    path: &mut Argument<'heap>,
    imports: &mut Argument<'heap>,
    body: &mut Argument<'heap>,
) -> Expr<'heap>
where
    S: BumpAllocator,
{
    let path_expr = mem::replace(&mut path.value, Expr::dummy());
    let path = if let ExprKind::Path(path) = path_expr.kind {
        if path.has_generic_arguments() {
            expander
                .diagnostics
                .push(error::use_path_generic_arguments(path.span));
            // non-fatal: continue with the path
        }
        Some(path)
    } else {
        expander
            .diagnostics
            .push(error::invalid_use_path(path_expr.span));
        None
    };

    let imports = lower_imports(expander, imports);

    // If either path or imports are invalid, we still visit the body
    // to collect diagnostics from nested expressions.
    let Some((path, imports)) = path.zip(imports) else {
        expander.visit(&mut body.value);
        return Expr::dummy();
    };

    // Snapshot/rollback runs unconditionally to ensure that scope never leaks.
    let snapshot = expander.namespace.snapshot();
    let body = lower_body(expander, &path, imports, body);
    expander.namespace.rollback_to(snapshot);

    body
}

/// Lowers a `use` call, importing names into scope for the body.
///
/// Form: `(use path imports body)` where:
/// - `path` is a module path like `core::math`
/// - `imports` is one of:
///   - `*` for a glob import
///   - `(sin, cos)` for named imports
///   - `(sin: my_sin, cos: _)` for aliased imports (`_` keeps the original name)
/// - `body` is the expression where the imports are in scope
///
/// Unlike other forms, `use` does not produce a dedicated AST node.
/// It resolves the imports into the namespace, visits the body with
/// those imports available, and returns the body directly.
pub(super) fn lower_use<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,
    CallExpr {
        id: _,
        span,
        function: _,
        arguments,
        labeled_arguments,
    }: &mut CallExpr<'heap>,
) -> Expr<'heap>
where
    S: BumpAllocator,
{
    if !labeled_arguments.is_empty() {
        expander
            .diagnostics
            .push(error::labeled_arguments_in_use(labeled_arguments));
    }

    if let [path, imports, body] = &mut **arguments {
        lower_use_impl(expander, path, imports, body)
    } else {
        expander
            .diagnostics
            .push(error::invalid_use_argument_count(*span, arguments));

        Expr::dummy()
    }
}
