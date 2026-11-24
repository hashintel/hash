use core::{alloc::Allocator, ops::ControlFlow};

use hashql_ast::node::{
    expr::{
        CallExpr, Expr, ExprKind,
        call::{Argument, LabeledArgument},
    },
    id::NodeId,
    path::{Path, PathSegment},
    r#type::Type,
};
use hashql_core::{
    heap::{self, Heap},
    span::{SpanAncestors, SpanId, SpanTable},
};
use hashql_diagnostics::{DiagnosticIssues, Severity, Status};
use text_size::{TextRange, TextSize};

use crate::{
    ParserOptions,
    cst::{self, Node, Token as _},
    embedded::{
        EmbeddedString, parse_expr_from_string_in, parse_ident_labelled_argument_from_string_in,
        parse_type_from_string_in,
    },
    error::{JExprDiagnosticCategory, array},
    parser::Document,
    span::Span,
    stack::ensure_sufficient_stack,
    syntax_kind::SyntaxKind,
};

mod constructor;

fn precedes<'tree, T, U>(first: Option<T>, second: Option<U>) -> bool
where
    T: Node<'tree>,
    U: Node<'tree>,
{
    match (first, second) {
        (Some(first), Some(second)) => first.offset() < second.offset(),
        _ => false,
    }
}

pub(crate) struct Lowerer<'heap, 'spans, A: Allocator> {
    heap: &'heap Heap,
    spans: &'spans mut SpanTable<Span>,
    options: ParserOptions,
    diagnostics: DiagnosticIssues<JExprDiagnosticCategory, SpanId, Severity>,
    alloc: A,
}

impl<'heap, 'spans, A: Allocator> Lowerer<'heap, 'spans, A> {
    const fn new_in(
        heap: &'heap Heap,
        spans: &'spans mut SpanTable<Span>,
        options: ParserOptions,
        alloc: A,
    ) -> Self {
        Self {
            heap,
            spans,
            options,
            diagnostics: DiagnosticIssues::new(),
            alloc,
        }
    }

    pub(crate) const fn heap(&self) -> &'heap Heap {
        self.heap
    }

    pub(crate) fn insert_range(&mut self, range: TextRange) -> SpanId {
        self.spans.insert(Span::new(range), SpanAncestors::EMPTY)
    }

    fn lower_type_field(
        &mut self,
        field: cst::TypeField<'_>,
    ) -> Option<heap::Box<'heap, Type<'heap>>> {
        let annotation = field.annotation()?;
        let token = annotation.token()?;
        let Ok(decoded) = token.decode() else {
            return None;
        };

        let key_range = field.key().map(cst::Token::text_range);
        let parent = self.insert_range(token.text_range());
        match parse_type_from_string_in(
            self.heap,
            self.spans,
            self.options,
            key_range,
            &EmbeddedString {
                parent,
                raw_quoted: token.text(),
                decoded,
            },
            &self.alloc,
        ) {
            Ok(r#type) => Some(Box::new_in(r#type, self.heap)),
            Err(diagnostic) => {
                self.diagnostics.push(
                    diagnostic
                        .map_category(JExprDiagnosticCategory::string)
                        .generalize(),
                );
                None
            }
        }
    }

    fn lower_optional_type(
        &mut self,
        type_field: Option<cst::TypeField<'_>>,
    ) -> ControlFlow<(), Option<heap::Box<'heap, Type<'heap>>>> {
        let Some(field) = type_field else {
            return ControlFlow::Continue(None);
        };

        self.lower_type_field(field)
            .map_or(ControlFlow::Break(()), |r#type| {
                ControlFlow::Continue(Some(r#type))
            })
    }

    fn check_orphaned_type_fields(&mut self, root: cst::SyntaxNodeData<'_>) {
        for child in root.children() {
            if child.kind() == SyntaxKind::JsonObject {
                for field in child.child_nodes::<cst::TypeField<'_>>() {
                    let _: Option<heap::Box<'heap, Type<'heap>>> = self.lower_type_field(field);
                }
            }
        }
    }

    /// Lowers a constructor's primary and `#type` fields in source order.
    ///
    /// Preserving source order keeps multi-field diagnostics ordered by byte offset.
    pub(crate) fn lower_typed_pair<'tree, Field, Output>(
        &mut self,
        type_field: Option<cst::TypeField<'tree>>,
        primary_field: Option<Field>,
        lower_primary: impl FnOnce(&mut Self, Field) -> Option<Output>,
    ) -> Option<(Output, Option<heap::Box<'heap, Type<'heap>>>)>
    where
        Field: Node<'tree>,
    {
        let (primary, r#type) = if precedes(type_field, primary_field) {
            let r#type = self.lower_optional_type(type_field);
            let primary = primary_field.and_then(|field| lower_primary(self, field));
            (primary, r#type)
        } else {
            let primary = primary_field.and_then(|field| lower_primary(self, field));
            let r#type = self.lower_optional_type(type_field);
            (primary, r#type)
        };

        Some((primary?, r#type.continue_value()?))
    }

    fn lower_path(&mut self, node: cst::PathExpr<'_>) -> Option<Expr<'heap>> {
        let token = node.token()?;
        let Ok(decoded) = token.decode() else {
            // Lexer already recorded `InvalidString`.
            return None;
        };

        let parent = self.insert_range(token.text_range());
        match parse_expr_from_string_in(
            self.heap,
            self.spans,
            self.options,
            &EmbeddedString {
                parent,
                raw_quoted: token.text(),
                decoded,
            },
            &self.alloc,
        ) {
            Ok(expr) => Some(expr),
            Err(diagnostic) => {
                self.diagnostics.push(
                    diagnostic
                        .map_category(JExprDiagnosticCategory::string)
                        .generalize(),
                );

                None
            }
        }
    }

    fn lower_shorthand_labeled_arg(
        &mut self,
        node: cst::ShorthandLabeledArg<'_>,
    ) -> Option<LabeledArgument<'heap>> {
        let token = node.token()?;
        let Ok(decoded) = token.decode() else {
            return None;
        };

        let token_span = self.insert_range(token.text_range());
        let string = EmbeddedString {
            parent: token_span,
            raw_quoted: token.text(),
            decoded,
        };

        let key = match parse_ident_labelled_argument_from_string_in(
            self.heap,
            self.spans,
            self.options,
            &string,
            &self.alloc,
        ) {
            Ok(ident) => ident,
            Err(error) => {
                let error = (error.offset(), error.into_inner());
                let diagnostic = array::labeled_argument_invalid_identifier_in(
                    self.spans,
                    token_span,
                    token.text(),
                    &string.decoded,
                    error,
                    &self.alloc,
                )
                .map_category(JExprDiagnosticCategory::array)
                .generalize();

                self.diagnostics.push(diagnostic);
                return None;
            }
        };

        let mut segments = Vec::with_capacity_in(1, self.heap);
        segments.push(PathSegment {
            id: NodeId::PLACEHOLDER,
            span: token_span,
            name: key,
            arguments: Vec::new_in(self.heap),
        });

        Some(LabeledArgument {
            id: NodeId::PLACEHOLDER,
            span: token_span,
            label: key,
            value: Argument {
                id: NodeId::PLACEHOLDER,
                span: token_span,
                value: Expr {
                    id: NodeId::PLACEHOLDER,
                    span: token_span,
                    kind: ExprKind::Path(Path {
                        id: NodeId::PLACEHOLDER,
                        span: token_span,
                        rooted: false,
                        segments,
                    }),
                },
            },
        })
    }

    fn lower_labeled_arg_entry(
        &mut self,
        entry: cst::LabeledArgEntry<'_>,
    ) -> Option<LabeledArgument<'heap>> {
        let key_ident = entry.key().and_then(|token| {
            let Ok(decoded) = token.decode() else {
                return None;
            };
            if !decoded.starts_with(':') {
                // Parser already reported `LabeledArgumentMissingPrefix`.
                return None;
            }
            let key_span = self.insert_range(token.text_range());
            let string = EmbeddedString {
                parent: key_span,
                raw_quoted: token.text(),
                decoded,
            };

            match parse_ident_labelled_argument_from_string_in(
                self.heap,
                self.spans,
                self.options,
                &string,
                &self.alloc,
            ) {
                Ok(ident) => Some(ident),
                Err(error) => {
                    let error = (error.offset(), error.into_inner());
                    let diagnostic = array::labeled_argument_invalid_identifier_in(
                        self.spans,
                        key_span,
                        token.text(),
                        &string.decoded,
                        error,
                        &self.alloc,
                    )
                    .map_category(JExprDiagnosticCategory::array)
                    .generalize();

                    self.diagnostics.push(diagnostic);
                    None
                }
            }
        });

        let value = entry.value().and_then(|expr| self.lower_expr(expr));
        let label = key_ident?;
        let value = value?;
        let span = self.insert_range(entry.text_range());

        Some(LabeledArgument {
            id: NodeId::PLACEHOLDER,
            span,
            label,
            value: Argument {
                id: NodeId::PLACEHOLDER,
                span: value.span,
                value,
            },
        })
    }

    fn lower_call(&mut self, node: cst::CallExpr<'_>) -> Option<Expr<'heap>> {
        let callee = node.callee().and_then(|expr| self.lower_expr(expr));

        let mut arguments = Vec::new_in(self.heap);
        let mut labeled_arguments = Vec::new_in(self.heap);
        let mut ok = callee.is_some();

        for argument in node.args() {
            match argument {
                cst::CallArg::Positional(positional) => {
                    if let Some(expr) = positional.expr().and_then(|expr| self.lower_expr(expr)) {
                        arguments.push(Argument {
                            id: NodeId::PLACEHOLDER,
                            span: expr.span,
                            value: expr,
                        });
                    } else {
                        ok = false;
                    }
                }
                cst::CallArg::ShorthandLabeled(shorthand) => {
                    if let Some(labeled) = self.lower_shorthand_labeled_arg(shorthand) {
                        labeled_arguments.push(labeled);
                    } else {
                        ok = false;
                    }
                }
                cst::CallArg::Labeled(labeled) => {
                    let mut entry_count = 0_usize;
                    for entry in labeled.entries() {
                        entry_count += 1;
                        if let Some(argument) = self.lower_labeled_arg_entry(entry) {
                            labeled_arguments.push(argument);
                        } else {
                            ok = false;
                        }
                    }
                    if entry_count != 1 {
                        ok = false;
                    }
                }
            }
        }

        let span = self.insert_range(node.text_range());
        let function = callee?;
        if !ok {
            return None;
        }

        Some(Expr {
            id: NodeId::PLACEHOLDER,
            span,
            kind: ExprKind::Call(CallExpr {
                id: NodeId::PLACEHOLDER,
                span,
                function: Box::new_in(function, self.heap),
                arguments,
                labeled_arguments,
            }),
        })
    }

    pub(crate) fn lower_expr(&mut self, expr: cst::Expr<'_>) -> Option<Expr<'heap>> {
        ensure_sufficient_stack(|| match expr {
            cst::Expr::Path(node) => self.lower_path(node),
            cst::Expr::Call(node) => self.lower_call(node),
            cst::Expr::Literal(node) => constructor::lower_literal(self, node),
            cst::Expr::Struct(node) => constructor::lower_struct(self, node),
            cst::Expr::Tuple(node) => constructor::lower_tuple(self, node),
            cst::Expr::List(node) => constructor::lower_list(self, node),
            cst::Expr::Dict(node) => constructor::lower_dict(self, node),
        })
    }
}

pub(crate) fn lower_expr_in<'heap, A: Allocator>(
    heap: &'heap Heap,
    spans: &mut SpanTable<Span>,
    options: ParserOptions,
    parse: &Document<cst::ExprRoot, A>,
    alloc: A,
) -> Status<Expr<'heap>, JExprDiagnosticCategory, SpanId> {
    let mut lowerer = Lowerer::new_in(heap, spans, options, alloc);

    for error in parse.errors() {
        let diagnostic = error
            .to_diagnostic_in(lowerer.heap, lowerer.spans)
            .generalize();
        lowerer.diagnostics.push(diagnostic);
    }

    let root = parse.tree();
    let expr = if let Some(item) = root.item() {
        lowerer.lower_expr(item)
    } else {
        lowerer.check_orphaned_type_fields(root.syntax());
        None
    };

    // Orders accumulated diagnostics by primary span start offset so multi-phase errors appear in
    // source order.
    lowerer.diagnostics.sort_by_key(|diagnostic| {
        let &span = diagnostic.labels.primary().span();

        lowerer
            .spans
            .absolute(span)
            .map_or(TextSize::new(u32::MAX), |span| span.range().start())
    });
    lowerer.diagnostics.into_status_with(|| {
        expr.expect("valid CST with no critical diagnostics must lower to an expression")
    })
}

pub(crate) fn lower_value_in<'heap, A: Allocator>(
    heap: &'heap Heap,
    spans: &mut SpanTable<Span>,
    options: ParserOptions,
    parse: &Document<cst::ValueRoot, A>,
    alloc: A,
) -> Status<Value<'heap>, JExprDiagnosticCategory, SpanId> {
    let mut lowerer = Lowerer::new_in(heap, spans, options, alloc);

    for error in parse.errors() {
        let diagnostic = error
            .to_diagnostic_in(lowerer.heap, lowerer.spans)
            .generalize();
        lowerer.diagnostics.push(diagnostic);
    }

    let root = parse.tree();
    let value = lowerer.lower_value(root);
    lowerer.diagnostics.into_status_with(|| value)
}
