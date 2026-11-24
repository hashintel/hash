use core::{alloc::Allocator, mem};

use hashql_ast::node::path::{Path, PathSegmentArgument};
use hashql_core::{
    heap::{self, CollectIn as _},
    intern::Interned,
    span::{SpanId, Spanned},
    symbol::{Ident, IdentKind, Symbol},
    r#type::TypeId,
};

use super::{error::internal_error, expr::ExprReifier};
use crate::{
    node::{
        Node, NodeData,
        kind::NodeKind,
        variable::{LocalVariable, QualifiedVariable, Variable},
    },
    path::QualifiedPath,
};

fn path_segment_arguments<'heap, A>(
    reifier: &mut ExprReifier<'_, '_, '_, 'heap, A>,
    arguments: heap::Vec<'heap, PathSegmentArgument<'heap>>,
) -> Option<Interned<'heap, [Spanned<TypeId>]>>
where
    A: Allocator + Clone,
{
    let mut incomplete = false;
    let mut types = Vec::with_capacity_in(arguments.len(), reifier.scratch.clone());

    for argument in arguments {
        let span = argument.span();
        let node = match argument {
            PathSegmentArgument::Argument(generic_argument) => {
                reifier.types.anonymous[generic_argument.r#type.id]
            }
            PathSegmentArgument::Constraint(generic_constraint) => {
                let def = &reifier.types.locals[generic_constraint.name.value];
                if !def.value.arguments.is_empty() {
                    reifier.diagnostics.push(internal_error(
                        generic_constraint.span,
                        "generic constraints with arguments should have been rejected by the \
                         sanitizer",
                    ));
                    incomplete = true;
                    continue;
                }

                def.value.id
            }
        };

        types.push(Spanned { span, value: node });
    }

    if incomplete {
        None
    } else {
        Some(reifier.context.interner.intern_type_ids(&types))
    }
}

pub(super) fn reify_path<'heap, A>(
    reifier: &mut ExprReifier<'_, '_, '_, 'heap, A>,
    path: Path<'heap>,
) -> Option<NodeKind<'heap>>
where
    A: Allocator + Clone,
{
    let span = path.span;
    let variable = match path.into_generic_ident() {
        Ok((ident, args)) => {
            let binder = reifier.binders.resolve(ident.value);

            Variable::Local(LocalVariable {
                id: Spanned {
                    span: ident.span,
                    value: binder,
                },
                arguments: path_segment_arguments(reifier, args)?,
            })
        }
        Err(mut path) => {
            if !path.rooted {
                reifier.diagnostics.push(internal_error(
                    span,
                    "relative paths should have been resolved during import resolution",
                ));
                return None;
            }

            let arguments = mem::replace(
                &mut path
                    .segments
                    .last_mut()
                    .unwrap_or_else(|| unreachable!())
                    .arguments,
                Vec::new_in(reifier.context.heap), // capacity of 0 does not allocate
            );

            let mut segments = Vec::with_capacity_in(path.segments.len(), reifier.scratch.clone());
            for segment in path.segments {
                segments.push(segment.name);
            }

            Variable::Qualified(QualifiedVariable {
                path: QualifiedPath::new_unchecked(
                    reifier.context.interner.intern_idents(&segments),
                ),
                arguments: path_segment_arguments(reifier, arguments)?,
            })
        }
    };

    Some(NodeKind::Variable(variable))
}

pub(super) fn make_qualified_path<'heap, A>(
    reifier: &mut ExprReifier<'_, '_, '_, 'heap, A>,
    span: SpanId,
    path: &[Symbol<'heap>],
) -> Node<'heap>
where
    A: Allocator + Clone,
{
    let path: Vec<_, _> = path
        .iter()
        .map(|&value| Ident {
            span,
            value,
            kind: IdentKind::Lexical,
        })
        .collect_in(&reifier.scratch);
    let path = QualifiedPath::new_unchecked(reifier.context.interner.intern_idents(&path));

    let node = NodeData {
        id: reifier.context.counter.hir.next(),
        span,
        kind: NodeKind::Variable(Variable::Qualified(QualifiedVariable {
            path,
            arguments: reifier.context.interner.intern_type_ids(&[]),
        })),
    };

    reifier.context.interner.intern_node(node)
}
