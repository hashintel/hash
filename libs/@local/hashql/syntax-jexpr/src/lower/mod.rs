//! Lowers a typed J-Expr CST into a [`hashql_ast::node::expr::Expr`].
//!
//! Collects lexical, syntactic, and embedded-DSL diagnostics into a [`Status`] in source order.

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
use hashql_diagnostics::{
    Diagnostic, DiagnosticIssues, Failure, Severity, Status, StatusExt as _,
    severity::SeverityKind as _,
};
use text_size::{TextRange, TextSize};

use crate::{
    cst::{self, Node, Token as _},
    embedded::{
        error::StringDiagnosticCategory, parse_expr_from_string,
        parse_ident_labelled_argument_from_string, parse_type_from_string,
    },
    error::{
        ArrayDiagnosticCategory, JExprDiagnosticCategory, ObjectDiagnosticCategory,
        ParserDiagnosticCategory, array,
    },
    parser::Parse,
    span::Span,
    syntax_kind::SyntaxKind,
};

mod constructor;

/// Lowers `parse` into an arena-allocated HashQL [`Expr`] and collects all diagnostics.
pub(crate) fn lower_expr<'heap>(
    heap: &'heap Heap,
    spans: &mut SpanTable<Span>,
    parse: &Parse<cst::ExprRoot>,
) -> Status<Expr<'heap>, JExprDiagnosticCategory, SpanId> {
    let mut lowerer = Lowerer::new(heap, spans);

    for error in parse.errors() {
        let diagnostic = error.to_diagnostic(lowerer.spans).generalize();
        lowerer.push_diagnostic(diagnostic);
    }

    let root = parse.tree();
    let expr = if let Some(item) = root.item() {
        lowerer.lower_expr(item)
    } else {
        lowerer.check_orphaned_type_fields(root.syntax());
        None
    };

    if lowerer.diagnostics.is_empty() {
        let expr = expr.expect("valid CST with no diagnostics must lower to an expression");
        return Status::success(expr);
    }

    if lowerer.diagnostics.critical() == 0 {
        let expr =
            expr.expect("valid CST with no critical diagnostics must lower to an expression");
        return lowerer.diagnostics.into_status(expr);
    }

    Err(into_ordered_failure(lowerer.diagnostics, lowerer.spans))
}

/// Orders accumulated diagnostics by primary span start offset and builds a [`Failure`].
fn into_ordered_failure(
    issues: DiagnosticIssues<JExprDiagnosticCategory, SpanId, Severity>,
    spans: &SpanTable<Span>,
) -> Failure<JExprDiagnosticCategory, SpanId> {
    let mut diagnostics = issues.into_vec();
    diagnostics.sort_by_key(|diagnostic| {
        diagnostic
            .labels
            .iter()
            .next()
            .and_then(|label| spans.absolute(*label.span()))
            .map_or(TextSize::new(u32::MAX), |span| span.range().start())
    });

    let position = diagnostics
        .iter()
        .position(|diagnostic| diagnostic.severity.is_critical())
        .expect("critical diagnostics must be present");

    let Err(primary) = diagnostics.remove(position).specialize() else {
        unreachable!("located diagnostic was verified critical");
    };

    Failure {
        primary: Box::new(primary),
        secondary: DiagnosticIssues::from(diagnostics),
    }
}

/// Shared lowering state collecting spans and diagnostics across one CST pass.
pub(crate) struct Lowerer<'heap, 'spans> {
    heap: &'heap Heap,
    spans: &'spans mut SpanTable<Span>,
    diagnostics: DiagnosticIssues<JExprDiagnosticCategory, SpanId, Severity>,
}

impl<'heap, 'spans> Lowerer<'heap, 'spans> {
    const fn new(heap: &'heap Heap, spans: &'spans mut SpanTable<Span>) -> Self {
        Self {
            heap,
            spans,
            diagnostics: DiagnosticIssues::new(),
        }
    }

    pub(crate) const fn heap(&self) -> &'heap Heap {
        self.heap
    }

    pub(crate) const fn spans_mut(&mut self) -> &mut SpanTable<Span> {
        self.spans
    }

    pub(crate) fn push_diagnostic(
        &mut self,
        diagnostic: Diagnostic<JExprDiagnosticCategory, SpanId, Severity>,
    ) {
        self.diagnostics.push(diagnostic);
    }

    pub(crate) fn insert_range(&mut self, range: TextRange) -> SpanId {
        self.spans.insert(Span::new(range), SpanAncestors::EMPTY)
    }

    /// Lowers one typed CST expression node.
    pub(crate) fn lower_expr(&mut self, expr: cst::Expr<'_>) -> Option<Expr<'heap>> {
        match expr {
            cst::Expr::Path(node) => self.lower_path(node),
            cst::Expr::Call(node) => self.lower_call(node),
            cst::Expr::Literal(node) => constructor::lower_literal(self, node),
            cst::Expr::Struct(node) => constructor::lower_struct(self, node),
            cst::Expr::Tuple(node) => constructor::lower_tuple(self, node),
            cst::Expr::List(node) => constructor::lower_list(self, node),
            cst::Expr::Dict(node) => constructor::lower_dict(self, node),
        }
    }

    /// Lowers a constructor's primary field and optional `#type` field in source order.
    pub(crate) fn lower_typed_pair<'tree, Field, Output>(
        &mut self,
        type_field: Option<cst::TypeField<'tree>>,
        primary_field: Option<Field>,
        lower_primary: impl FnOnce(&mut Self, Field) -> Option<Output>,
    ) -> Option<(Output, Option<heap::Box<'heap, Type<'heap>>>)>
    where
        Field: Node<'tree>,
    {
        let type_first = precedes(type_field, primary_field);

        let (primary, r#type, type_ok) = if type_first {
            let (r#type, type_ok) = self.lower_optional_type(type_field);
            let primary = primary_field.and_then(|field| lower_primary(self, field));
            (primary, r#type, type_ok)
        } else {
            let primary = primary_field.and_then(|field| lower_primary(self, field));
            let (r#type, type_ok) = self.lower_optional_type(type_field);
            (primary, r#type, type_ok)
        };

        let primary = primary?;
        if !type_ok {
            return None;
        }
        Some((primary, r#type))
    }

    fn check_orphaned_type_fields(&mut self, root: cst::SyntaxNode<'_>) {
        for child in root.children() {
            if child.kind() == SyntaxKind::JsonObject {
                for field in child.child_nodes::<cst::TypeField<'_>>() {
                    let _: Option<heap::Box<'heap, Type<'heap>>> = self.lower_type_field(field);
                }
            }
        }
    }

    fn lower_path(&mut self, node: cst::PathExpr<'_>) -> Option<Expr<'heap>> {
        let token = node.token()?;
        let Ok(decoded) = token.decode() else {
            // Lexer already recorded `InvalidString`.
            return None;
        };

        let parent = self.insert_range(token.text_range());
        match parse_expr_from_string(self.heap, self.spans, parent, &decoded) {
            Ok(expr) => Some(expr),
            Err(diagnostic) => {
                self.diagnostics
                    .push(diagnostic.map_category(wrap_string).generalize());
                None
            }
        }
    }

    fn lower_call(&mut self, node: cst::CallExpr<'_>) -> Option<Expr<'heap>> {
        let callee = node.callee().and_then(|expr| self.lower_expr(expr));

        let mut arguments = Vec::new_in(self.heap);
        let mut labeled_arguments = Vec::new_in(self.heap);
        let mut ok = callee.is_some();

        for arg in node.args() {
            match arg {
                cst::CallArg::Positional(pos) => {
                    if let Some(expr) = pos.expr().and_then(|expr| self.lower_expr(expr)) {
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
                        if let Some(arg) = self.lower_labeled_arg_entry(entry) {
                            labeled_arguments.push(arg);
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

    fn lower_shorthand_labeled_arg(
        &mut self,
        node: cst::ShorthandLabeledArg<'_>,
    ) -> Option<LabeledArgument<'heap>> {
        let token = node.token()?;
        let Ok(decoded) = token.decode() else {
            return None;
        };

        let token_span = self.insert_range(token.text_range());
        let key = match parse_ident_labelled_argument_from_string(
            self.heap, self.spans, token_span, &decoded,
        ) {
            Ok(ident) => ident,
            Err(error) => {
                let error = (error.offset(), error.into_inner());
                let diagnostic =
                    array::labeled_argument_invalid_identifier(self.spans, token_span, error)
                        .map_category(wrap_array)
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
            match parse_ident_labelled_argument_from_string(
                self.heap, self.spans, key_span, &decoded,
            ) {
                Ok(ident) => Some(ident),
                Err(error) => {
                    let error = (error.offset(), error.into_inner());
                    let diagnostic =
                        array::labeled_argument_invalid_identifier(self.spans, key_span, error)
                            .map_category(wrap_array)
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

    fn lower_type_field(
        &mut self,
        field: cst::TypeField<'_>,
    ) -> Option<heap::Box<'heap, Type<'heap>>> {
        let annotation = field.annotation()?;
        let token = annotation.token()?;
        let Ok(decoded) = token.decode() else {
            return None;
        };

        let parent = self.insert_range(token.text_range());
        match parse_type_from_string(self.heap, self.spans, parent, &decoded) {
            Ok(r#type) => Some(Box::new_in(r#type, self.heap)),
            Err(diagnostic) => {
                self.diagnostics
                    .push(diagnostic.map_category(wrap_string).generalize());
                None
            }
        }
    }

    fn lower_optional_type(
        &mut self,
        type_field: Option<cst::TypeField<'_>>,
    ) -> (Option<heap::Box<'heap, Type<'heap>>>, bool) {
        type_field.map_or((None, true), |field| {
            self.lower_type_field(field)
                .map_or((None, false), |r#type| (Some(r#type), true))
        })
    }
}

fn precedes<'tree, First, Second>(first: Option<First>, second: Option<Second>) -> bool
where
    First: Node<'tree>,
    Second: Node<'tree>,
{
    match (first, second) {
        (Some(first), Some(second)) => first.offset() < second.offset(),
        _ => false,
    }
}

const fn wrap_string(category: StringDiagnosticCategory) -> JExprDiagnosticCategory {
    JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::String(category))
}

const fn wrap_array(category: ArrayDiagnosticCategory) -> JExprDiagnosticCategory {
    JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Array(category))
}

pub(crate) const fn wrap_object(category: ObjectDiagnosticCategory) -> JExprDiagnosticCategory {
    JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Object(category))
}
