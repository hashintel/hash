use core::{iter, mem};

use hashql_core::{
    collections::fast_hash_map_with_capacity_in,
    heap::BumpAllocator,
    module::namespace::{ImportOptions, ResolutionMode},
    span::SpanId,
    symbol::sym,
};

use super::{BindingKind, Expander};
use crate::node::{
    expr::{
        CallExpr, Expr, ExprKind,
        call::Argument,
        r#use::{self, UseBinding, UseKind},
    },
    id::NodeId,
    path::Path,
};

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
        ExprKind::Tuple(tuple) => {
            let mut bindings = Vec::with_capacity_in(tuple.elements.len(), expander.heap);

            for element in tuple.elements.drain(..) {
                let ExprKind::Path(path) = element.value.kind else {
                    todo!("diagnostic");
                    continue;
                };

                let Some(name) = path.into_ident() else {
                    todo!("diagnostic");
                    continue;
                };

                bindings.push(UseBinding {
                    id: NodeId::PLACEHOLDER,
                    span: element.span,
                    name,
                    alias: None,
                });
            }

            Some(UseKind::Named(bindings))
        }
        ExprKind::Struct(r#struct) => {
            let mut bindings = Vec::with_capacity_in(r#struct.entries.len(), expander.heap);

            for entry in r#struct.entries.drain(..) {
                let alias = match &entry.value.kind {
                    ExprKind::Underscore => None,
                    ExprKind::Path(path) if let Some(&ident) = path.as_ident() => Some(ident),
                    _ => {
                        todo!("diagnostic");
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

            Some(UseKind::Named(bindings))
        }
        _ => {
            todo!("kael you know what to do");
            None
        }
    };

    if let Some(UseKind::Named(bindings)) = &mut imports {
        expander.scratch.scoped(|scratch| {
            let mut seen = fast_hash_map_with_capacity_in(bindings.len(), scratch);

            bindings.retain(|binding| {
                if let Err(error) =
                    seen.try_insert(binding.alias.unwrap_or(binding.name).value, binding.span)
                {
                    todo!("diagnostic");
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
    path: Path<'heap>,
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
                    todo!("diagnostic");
                    errored |= true;
                    continue;
                }
            }

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
                query.iter().copied(),
                ImportOptions {
                    glob: true,
                    mode,
                    suggestions: true,
                },
            );

            let mut body = mem::replace(&mut body.value, Expr::dummy());
            expander.visit(&mut body);

            if let Err(error) = result {
                todo!("diagnostic");
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
    let path = mem::replace(&mut path.value, Expr::dummy());
    let ExprKind::Path(path) = path.kind else {
        todo!("kael you know what to do!");
        return Expr::dummy();
    };

    if path.has_generic_arguments() {
        todo!("kael you know what to do!");
        // we continue here, because it's not "fatal"
    }

    let Some(imports) = lower_imports(expander, imports) else {
        return Expr::dummy();
    };

    let snapshot = expander.namespace.snapshot();
    let body = lower_body(expander, path, imports, body);
    expander.namespace.rollback_to(snapshot);

    body
}

pub(super) fn lower_use<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,
    CallExpr {
        id: _,
        span: _,
        function: _,
        arguments,
        labeled_arguments,
    }: &mut CallExpr<'heap>,
) -> Expr<'heap>
where
    S: BumpAllocator,
{
    if !labeled_arguments.is_empty() {
        todo!("kael you know what to do :3")
    }

    if let [path, imports, body] = &mut **arguments {
        lower_use_impl(expander, path, imports, body)
    } else {
        todo!("kael you know what to do :3");

        Expr::dummy()
    }
}
