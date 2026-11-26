use alloc::alloc::Global;

use hashql_ast::node::{
    expr::{
        AsExpr, CallExpr, DictExpr, Expr, ExprKind, ListExpr, LiteralExpr, StructExpr, TupleExpr,
        dict::DictEntry, list::ListElement, r#struct::StructEntry, tuple::TupleElement,
    },
    id::NodeId,
    path::{Path, PathSegment},
    r#type::{Type, TypeKind},
    value::Value as AstValue,
};
use hashql_core::{
    heap::{Heap, Scratch},
    module::ModuleRegistry,
    span::{Span as CoreSpan, SpanAncestors, SpanId, SpanTable, TextRange, TextSize},
    symbol::{Ident, IdentKind},
    r#type::environment::Environment,
    value::{self, Primitive},
};
use hashql_diagnostics::{
    diagnostic::render::{ColorDepth, Format, RenderOptions},
    source::{Source, SourceId, Sources},
};

use super::{
    error::{ReificationDiagnosticCategory, ReificationStatus},
    value::ValueReifier,
};
use crate::{
    context::HirContext,
    intern::Interner,
    node::{Value, data::Data, kind::NodeKind},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
struct TestSpan(TextRange);

impl CoreSpan for TestSpan {
    fn range(&self) -> TextRange {
        self.0
    }
}

fn span(spans: &mut SpanTable<TestSpan>, start: usize, end: usize) -> SpanId {
    spans.insert(
        TestSpan(TextRange::new(
            TextSize::try_from(start).expect("start offset fits in TextSize"),
            TextSize::try_from(end).expect("end offset fits in TextSize"),
        )),
        SpanAncestors::EMPTY,
    )
}

fn synthetic_literal(kind: Primitive<'_>) -> Expr<'_> {
    Expr {
        id: NodeId::PLACEHOLDER,
        span: SpanId::SYNTHETIC,
        kind: ExprKind::Literal(LiteralExpr {
            id: NodeId::PLACEHOLDER,
            span: SpanId::SYNTHETIC,
            kind,
            r#type: None,
        }),
    }
}

fn struct_entry<'heap>(heap: &'heap Heap, name: &str, value: Expr<'heap>) -> StructEntry<'heap> {
    StructEntry {
        id: NodeId::PLACEHOLDER,
        span: SpanId::SYNTHETIC,
        key: Ident {
            span: SpanId::SYNTHETIC,
            value: heap.intern_symbol(name),
            kind: IdentKind::Lexical,
        },
        value,
    }
}

fn render_failure<T>(
    status: ReificationStatus<T>,
    source: &str,
    spans: &SpanTable<TestSpan>,
) -> (ReificationDiagnosticCategory, usize, String) {
    let Err(failure) = status else {
        panic!("expected reification failure");
    };
    let category = failure.primary.category;
    let count = 1 + failure.secondary.len();
    let mut sources = Sources::new();
    sources.push(Source::new(source));

    let mut options = RenderOptions::new(Format::Ansi, &sources);
    options.color_depth = ColorDepth::Monochrome;

    let rendered = failure.into_issues().render(options, &mut &*spans);
    (category, count, rendered)
}

#[test]
fn value_all_data_constructors() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let modules = ModuleRegistry::new(&env);
    let interner = Interner::new(&heap);
    let mut context = HirContext::new(&interner, &modules);

    let mut list_elements = Vec::new_in(&heap);
    list_elements.push(ListElement {
        id: NodeId::PLACEHOLDER,
        span: SpanId::SYNTHETIC,
        value: Box::new_in(synthetic_literal(Primitive::Boolean(true)), &heap),
    });

    let mut tuple_elements = Vec::new_in(&heap);
    tuple_elements.push(TupleElement {
        id: NodeId::PLACEHOLDER,
        span: SpanId::SYNTHETIC,
        value: synthetic_literal(Primitive::Null),
    });

    let mut dict_entries = Vec::new_in(&heap);
    dict_entries.push(DictEntry {
        id: NodeId::PLACEHOLDER,
        span: SpanId::SYNTHETIC,
        key: Box::new_in(
            synthetic_literal(Primitive::String(value::String::new(
                heap.intern_symbol("k"),
            ))),
            &heap,
        ),
        value: Box::new_in(
            synthetic_literal(Primitive::Integer(value::Integer::new_unchecked(
                heap.intern_symbol("7"),
            ))),
            &heap,
        ),
    });

    let mut struct_entries = Vec::new_in(&heap);
    struct_entries.push(struct_entry(
        &heap,
        "list",
        Expr {
            id: NodeId::PLACEHOLDER,
            span: SpanId::SYNTHETIC,
            kind: ExprKind::List(ListExpr {
                id: NodeId::PLACEHOLDER,
                span: SpanId::SYNTHETIC,
                elements: list_elements,
                r#type: None,
            }),
        },
    ));
    struct_entries.push(struct_entry(
        &heap,
        "tuple",
        Expr {
            id: NodeId::PLACEHOLDER,
            span: SpanId::SYNTHETIC,
            kind: ExprKind::Tuple(TupleExpr {
                id: NodeId::PLACEHOLDER,
                span: SpanId::SYNTHETIC,
                elements: tuple_elements,
                r#type: None,
            }),
        },
    ));
    struct_entries.push(struct_entry(
        &heap,
        "dict",
        Expr {
            id: NodeId::PLACEHOLDER,
            span: SpanId::SYNTHETIC,
            kind: ExprKind::Dict(DictExpr {
                id: NodeId::PLACEHOLDER,
                span: SpanId::SYNTHETIC,
                entries: dict_entries,
                r#type: None,
            }),
        },
    ));

    let value = AstValue::new_unchecked(Expr {
        id: NodeId::PLACEHOLDER,
        span: SpanId::SYNTHETIC,
        kind: ExprKind::Struct(StructExpr {
            id: NodeId::PLACEHOLDER,
            span: SpanId::SYNTHETIC,
            entries: struct_entries,
            r#type: None,
        }),
    });

    let hir_value = Value::from_ast_in(value, &mut context, Scratch::new())
        .expect("valid compound value must reify")
        .value;

    let NodeKind::Data(Data::Struct(r#struct)) = hir_value.node().kind else {
        panic!("expected struct data node, got {:?}", hir_value.node().kind);
    };
    assert_eq!(r#struct.fields.len(), 3);
}

#[test]
fn value_call_in_struct_field() {
    let source = r##"{"#struct": {"x": ["add", {"#literal": 1}]}}"##;
    let mut spans = SpanTable::new(SourceId::new_unchecked(0));
    let root_span = span(&mut spans, 0, source.len());
    let field_span = span(&mut spans, 13, 16);
    let call_span = span(&mut spans, 18, 42);
    let callee_span = span(&mut spans, 19, 24);

    let heap = Heap::new();
    let env = Environment::new(&heap);
    let modules = ModuleRegistry::new(&env);
    let interner = Interner::new(&heap);
    let mut context = HirContext::new(&interner, &modules);

    let mut segments = Vec::new_in(&heap);
    segments.push(PathSegment {
        id: NodeId::PLACEHOLDER,
        span: callee_span,
        name: Ident {
            span: callee_span,
            value: heap.intern_symbol("add"),
            kind: IdentKind::Lexical,
        },
        arguments: Vec::new_in(&heap),
    });

    let call = Expr {
        id: NodeId::PLACEHOLDER,
        span: call_span,
        kind: ExprKind::Call(CallExpr {
            id: NodeId::PLACEHOLDER,
            span: call_span,
            function: Box::new_in(
                Expr {
                    id: NodeId::PLACEHOLDER,
                    span: callee_span,
                    kind: ExprKind::Path(Path {
                        id: NodeId::PLACEHOLDER,
                        span: callee_span,
                        rooted: false,
                        segments,
                    }),
                },
                &heap,
            ),
            arguments: Vec::new_in(&heap),
            labeled_arguments: Vec::new_in(&heap),
        }),
    };

    let mut entries = Vec::new_in(&heap);
    entries.push(StructEntry {
        id: NodeId::PLACEHOLDER,
        span: call_span,
        key: Ident {
            span: field_span,
            value: heap.intern_symbol("x"),
            kind: IdentKind::Lexical,
        },
        value: call,
    });

    let expr = Expr {
        id: NodeId::PLACEHOLDER,
        span: root_span,
        kind: ExprKind::Struct(StructExpr {
            id: NodeId::PLACEHOLDER,
            span: root_span,
            entries,
            r#type: None,
        }),
    };

    let status = ValueReifier::new(&mut context, &Global).reify(expr);
    let (category, count, rendered) = render_failure(status, source, &spans);
    assert_eq!(
        category,
        ReificationDiagnosticCategory::InvalidValueExpression
    );
    assert_eq!(count, 1);
    assert!(
        rendered.contains("function call `add` is not allowed in a value"),
        "{rendered}"
    );
    assert!(
        rendered.contains("in field `x` of this struct value"),
        "{rendered}"
    );
}

#[test]
fn value_as_expression_secondary_label() {
    let source = r##"["as", {"#literal": 1}, "Int"]"##;
    let mut spans = SpanTable::new(SourceId::new_unchecked(0));
    let root_span = span(&mut spans, 0, source.len());
    let type_span = span(&mut spans, 24, 29);

    let heap = Heap::new();
    let env = Environment::new(&heap);
    let modules = ModuleRegistry::new(&env);
    let interner = Interner::new(&heap);
    let mut context = HirContext::new(&interner, &modules);

    let expr = Expr {
        id: NodeId::PLACEHOLDER,
        span: root_span,
        kind: ExprKind::As(AsExpr {
            id: NodeId::PLACEHOLDER,
            span: root_span,
            value: Box::new_in(
                Expr {
                    id: NodeId::PLACEHOLDER,
                    span: root_span,
                    kind: ExprKind::Literal(LiteralExpr {
                        id: NodeId::PLACEHOLDER,
                        span: root_span,
                        kind: Primitive::Null,
                        r#type: None,
                    }),
                },
                &heap,
            ),
            r#type: Box::new_in(
                Type {
                    id: NodeId::PLACEHOLDER,
                    span: type_span,
                    kind: TypeKind::Infer,
                },
                &heap,
            ),
        }),
    };

    let status = ValueReifier::new(&mut context, &Global).reify(expr);
    let (category, count, rendered) = render_failure(status, source, &spans);
    assert_eq!(
        category,
        ReificationDiagnosticCategory::InvalidValueExpression
    );
    assert_eq!(count, 1);
    assert!(
        rendered.contains("type assertions are not allowed in values"),
        "{rendered}"
    );
    assert!(rendered.contains("type assertion here"), "{rendered}");
}
