use alloc::alloc::Global;
use core::{alloc::Allocator, iter, mem::ManuallyDrop};
use std::thread;

use hashql_ast::{
    format::SyntaxDump as _,
    node::{expr::ExprKind, r#type::TypeKind},
};
use hashql_core::{
    heap::Heap,
    span::{SpanId, SpanTable},
};
use hashql_diagnostics::{
    Diagnostic, Failure, Success,
    category::DiagnosticCategory,
    diagnostic::render::{ColorDepth, Format, RenderOptions},
    severity::SeverityKind,
    source::{Source, SourceId, Sources},
};
use proptest::{prop_assert, prop_assert_eq, property_test};

use crate::{
    JExprDiagnosticCategory, Parser, ParserOptions,
    cst::{self, Node, Token as _, TreeRoot},
    error::{
        ArrayDiagnosticCategory, LexerDiagnosticCategory, ObjectDiagnosticCategory,
        ParserDiagnosticCategory, StringDiagnosticCategory,
    },
    lower,
    parser::{self, Document, Grammar, expr::ExprGrammar},
    span::Span,
    syntax_kind::{SyntaxKind, T},
    syntax_kind_set::SyntaxKindSet,
};

fn parse_expr_cst(source: &str) -> Document<cst::ExprRoot, Global> {
    parser::Parser::<ExprGrammar, Global>::parse_cst_in(source, ParserOptions::default(), Global)
}

fn render_diagnostic<C, K>(
    source: &str,
    diagnostic: &Diagnostic<C, SpanId, K>,
    mut spans: &SpanTable<Span>,
) -> String
where
    C: DiagnosticCategory,
    K: SeverityKind,
{
    let mut sources = Sources::new();
    sources.push(Source::new(source));

    let mut options = RenderOptions::new(Format::Ansi, &sources);
    options.color_depth = ColorDepth::Monochrome;

    diagnostic.render(options, &mut spans)
}

#[track_caller]
fn parse_ok_dump(input: &str) -> String {
    let heap = Heap::new();
    let mut spans = SpanTable::new(SourceId::new_unchecked(0));
    let mut parser = Parser::new(&heap, &mut spans, ParserOptions::default());

    match parser.parse_expr_in(input, Global) {
        Ok(Success { value: expr, .. }) => expr.syntax_dump_to_string(),
        Err(Failure { primary, .. }) => {
            panic!("expected `{input}` to parse, got {:?}", primary.category);
        }
    }
}

#[track_caller]
fn parse_err_categories(input: &str) -> Vec<JExprDiagnosticCategory> {
    let heap = Heap::new();
    let mut spans = SpanTable::new(SourceId::new_unchecked(0));
    let mut parser = Parser::new(&heap, &mut spans, ParserOptions::default());

    match parser.parse_expr_in(input, Global) {
        Ok(_) => panic!("expected `{input}` to fail parsing"),
        Err(Failure { primary, secondary }) => {
            let mut categories = vec![primary.category];
            categories.extend(secondary.iter().map(|diagnostic| diagnostic.category));
            // Verify every produced diagnostic renders cleanly against `input` and `spans`.
            let rendered_primary = render_diagnostic(input, &primary, &spans);
            assert_ne!(rendered_primary, "");
            for diagnostic in secondary.iter() {
                assert_ne!(render_diagnostic(input, diagnostic, &spans), "");
            }
            categories
        }
    }
}

/// Removes the `#<node>@<span>` suffix of every node in a syntax dump.
///
/// The span of a node is numbered in the order the spans were created, which follows the order
/// of the fields in the source.
fn without_node_ids(dump: &str) -> String {
    let is_digit = |character: char| character.is_ascii_digit();
    let mut output = String::with_capacity(dump.len());

    let mut rest = dump;
    while let Some((head, tail)) = rest.split_once('#') {
        output.push_str(head);

        let after_node = tail.trim_start_matches(is_digit);
        match after_node.strip_prefix('@') {
            Some(after_at) if after_node.len() < tail.len() => {
                rest = after_at.trim_start_matches(is_digit);
            }
            _ => {
                output.push('#');
                rest = tail;
            }
        }
    }
    output.push_str(rest);

    output
}

#[test]
fn lossless_round_trip_and_trivia_trimming() {
    let source = "// head\n  { /* c1 **/\n  \"#type\": \"Int\", /* c2 */ \"#literal\": 42 // \
                  inline\n} // tail";
    let parse = parse_expr_cst(source);
    assert!(parse.is_valid(), "unexpected errors: {:?}", parse.errors());
    assert_eq!(parse.green().to_string(), source);

    let root = parse.tree();
    let Some(cst::Expr::Literal(literal)) = root.item() else {
        panic!("expected literal expression");
    };
    let literal_text = literal.green().to_string();
    assert!(literal_text.starts_with('{'));
    assert!(literal_text.ends_with('}'));
    assert_eq!(
        source.get(
            usize::from(literal.text_range().start())..usize::from(literal.text_range().end())
        ),
        Some(literal_text.as_str())
    );

    let value = literal.value().expect("literal value present");
    assert_eq!(value.green().to_string(), "42");
    assert!(matches!(
        value.token(),
        Some(cst::LiteralToken::Number(token)) if token.text() == "42" && !token.is_float()
    ));

    let type_token = literal
        .type_field()
        .and_then(cst::TypeField::annotation)
        .and_then(cst::TypeAnnotation::token)
        .expect("type annotation token present");
    assert_eq!(type_token.decode().expect("valid string"), "Int");

    let root_syntax = root.syntax();
    assert_eq!(root_syntax.children().count(), 1);
    assert!(
        root_syntax
            .tokens()
            .any(|token| token.kind() == SyntaxKind::LineComment)
    );
    assert!(format!("{literal:?}").starts_with("Literal"));
}

#[test]
fn type_field_order_equivalence() {
    for (before, after) in [
        (
            r##"{"#type": "Int", "#literal": 42}"##,
            r##"{"#literal": 42, "#type": "Int"}"##,
        ),
        (
            r##"{"#type": "Person", "#struct": {"name": {"#literal": "Ada"}}}"##,
            r##"{"#struct": {"name": {"#literal": "Ada"}}, "#type": "Person"}"##,
        ),
        (
            r##"{"#type": "(Int, String)", "#tuple": [{"#literal": 1}, {"#literal": "a"}]}"##,
            r##"{"#tuple": [{"#literal": 1}, {"#literal": "a"}], "#type": "(Int, String)"}"##,
        ),
        (
            r##"{"#type": "List<Int>", "#list": [{"#literal": 1}]}"##,
            r##"{"#list": [{"#literal": 1}], "#type": "List<Int>"}"##,
        ),
        (
            r##"{"#type": "Dict<String, Int>", "#dict": {"a": {"#literal": 1}}}"##,
            r##"{"#dict": {"a": {"#literal": 1}}, "#type": "Dict<String, Int>"}"##,
        ),
    ] {
        let dump_before = without_node_ids(&parse_ok_dump(before));
        let dump_after = without_node_ids(&parse_ok_dump(after));
        assert!(dump_before.contains("Type"));
        assert_eq!(dump_before, dump_after);
    }
}

#[test]
fn call_arguments_and_escaped_keys() {
    let source = r##"["greet", "::core::id", {":name": {"#literal": "Alice"}}, ":age", {"\u0023literal": true}, {"\u003aflag": {"#literal": null}}]"##;
    let parse = parse_expr_cst(source);
    assert!(parse.is_valid(), "errors: {:?}", parse.errors());

    let Some(cst::Expr::Call(call)) = parse.tree().item() else {
        panic!("expected call expression");
    };
    assert!(matches!(call.callee(), Some(cst::Expr::Path(_))));
    let args: Vec<_> = call.args().collect();
    assert_eq!(args.len(), 5);
    assert!(matches!(args[0], cst::CallArg::Positional(_)));
    assert!(matches!(args[1], cst::CallArg::Labeled(_)));
    assert!(matches!(args[2], cst::CallArg::ShorthandLabeled(_)));
    assert!(matches!(args[3], cst::CallArg::Positional(_)));
    assert!(matches!(args[4], cst::CallArg::Labeled(_)));

    let dump = parse_ok_dump(source);
    assert!(dump.contains("CallExpr"));
    assert!(dump.contains("LabeledArgument"));
}

#[test]
fn call_object_args_with_trivia() {
    let source = "[\"greet\", /* lead1 */ { /* inner1 */\n  \":name\": {\"#literal\": \"Alice\"} \
                  }, /* lead2 */ { /* inner2 */\n  \"#literal\": 1 }]";
    let parse = parse_expr_cst(source);
    assert!(parse.is_valid(), "errors: {:?}", parse.errors());
    assert_eq!(parse.green().to_string(), source);

    let Some(cst::Expr::Call(call)) = parse.tree().item() else {
        panic!("expected call expression");
    };
    let args: Vec<_> = call.args().collect();
    assert_eq!(args.len(), 2);
    assert!(matches!(args[0], cst::CallArg::Labeled(_)));
    assert!(args[0].green().to_string().starts_with('{'));
    assert!(matches!(
        args[1],
        cst::CallArg::Positional(positional) if matches!(positional.expr(), Some(cst::Expr::Literal(_)))
    ));
    assert!(args[1].green().to_string().starts_with('{'));

    // Unterminated trivia inside `{` must not trigger a spurious empty-object error.
    let categories = parse_err_categories("[\"greet\", { /* unclosed");
    assert_eq!(
        categories,
        vec![JExprDiagnosticCategory::Parser(
            ParserDiagnosticCategory::Lexer(LexerDiagnosticCategory::UnterminatedBlockComment)
        )]
    );
}

#[test]
fn multi_diagnostic_recovery_across_phases() {
    let source = r##"["add", {"#literal": 42.}, {"#struct": {"123bad": {"#literal": 1}}, "#type": ""}, "foo$bar"]"##;
    let categories = parse_err_categories(source);

    assert_eq!(
        categories,
        vec![
            JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
                LexerDiagnosticCategory::InvalidNumber
            )),
            JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Object(
                ObjectDiagnosticCategory::StructKeyExpectedIdentifier
            )),
            JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::String(
                StringDiagnosticCategory::InvalidType
            )),
            JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::String(
                StringDiagnosticCategory::InvalidExpression
            )),
        ]
    );
}

#[test]
fn multi_diagnostic_source_order_embedded_before_outer() {
    let source = r##"["foo$bar", {"#literal": 42.}, {"#struct": {"123bad": {"#literal": 1}}}]"##;
    let categories = parse_err_categories(source);

    assert_eq!(
        categories,
        vec![
            JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::String(
                StringDiagnosticCategory::InvalidExpression
            )),
            JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
                LexerDiagnosticCategory::InvalidNumber
            )),
            JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Object(
                ObjectDiagnosticCategory::StructKeyExpectedIdentifier
            )),
        ]
    );
}

const SINGLE_ERROR_CASES: &[(&str, JExprDiagnosticCategory)] = &[
    (
        r##"{"#literal": 42.}"##,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
            LexerDiagnosticCategory::InvalidNumber,
        )),
    ),
    (
        r##"{"#literal": "\z"}"##,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
            LexerDiagnosticCategory::InvalidString,
        )),
    ),
    (
        "{\"#literal\": \u{1f980}}",
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
            LexerDiagnosticCategory::InvalidCharacter,
        )),
    ),
    (
        "[]",
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Array(
            ArrayDiagnosticCategory::Empty,
        )),
    ),
    (
        "{}",
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Object(
            ObjectDiagnosticCategory::Empty,
        )),
    ),
    (
        r##"{"#type": "Int"}"##,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Object(
            ObjectDiagnosticCategory::OrphanedType,
        )),
    ),
    (
        r##"{"#type": ["a"]}"##,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Object(
            ObjectDiagnosticCategory::TypeExpectedString,
        )),
    ),
    (
        r##"{"#literal": 1, "#literal": 2}"##,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Object(
            ObjectDiagnosticCategory::DuplicateKey,
        )),
    ),
    (
        r##"{"#literal": 1, "#list": []}"##,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Object(
            ObjectDiagnosticCategory::ConflictingConstructor,
        )),
    ),
    (
        r##"{"#struct": [1]}"##,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Object(
            ObjectDiagnosticCategory::StructExpectedObject,
        )),
    ),
    (
        r##"{"#tuple": {}}"##,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Object(
            ObjectDiagnosticCategory::TupleExpectedArray,
        )),
    ),
    (
        r##"{"#list": {}}"##,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Object(
            ObjectDiagnosticCategory::ListExpectedArray,
        )),
    ),
    (
        r##"{"#dict": "invalid"}"##,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Object(
            ObjectDiagnosticCategory::DictExpectedFormat,
        )),
    ),
    (
        r##"{"#dict": [[{"#literal": "k"}]]}"##,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Object(
            ObjectDiagnosticCategory::DictEntryTooFewItems,
        )),
    ),
    (
        r##"{"#dict": [[{"#literal": "k"}, {"#literal": "v"}, {"#literal": "x"}]]}"##,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Object(
            ObjectDiagnosticCategory::DictEntryTooManyItems,
        )),
    ),
    (
        r##"{"#dict": [{"not": "array"}]}"##,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Object(
            ObjectDiagnosticCategory::DictEntryExpectedArray,
        )),
    ),
    (
        r#"["a",]"#,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Array(
            ArrayDiagnosticCategory::TrailingComma,
        )),
    ),
    (
        r#"[, "a"]"#,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Array(
            ArrayDiagnosticCategory::LeadingComma,
        )),
    ),
    (
        r#"["a",, "b"]"#,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Array(
            ArrayDiagnosticCategory::ConsecutiveComma,
        )),
    ),
    (
        r##"{"#struct": {"a":: {"#literal": 1}}}"##,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Object(
            ObjectDiagnosticCategory::ConsecutiveColon,
        )),
    ),
    (
        r#"["a"} "#,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
            LexerDiagnosticCategory::UnexpectedToken,
        )),
    ),
    (
        r#"["a"] "extra""#,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::ExpectedEof),
    ),
    (
        "/* unclosed",
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
            LexerDiagnosticCategory::UnterminatedBlockComment,
        )),
    ),
    // An invalid token is one mistake wherever it stands.
    (
        "\u{feff}[\"f\", \"x\"]",
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
            LexerDiagnosticCategory::InvalidCharacter,
        )),
    ),
    (
        r#"x ["f", "y"]"#,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
            LexerDiagnosticCategory::InvalidToken,
        )),
    ),
    (
        "@",
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
            LexerDiagnosticCategory::InvalidCharacter,
        )),
    ),
    (
        r##"{"#literal" @ 1}"##,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
            LexerDiagnosticCategory::InvalidCharacter,
        )),
    ),
    (
        r##"{"#literal" @: 1}"##,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
            LexerDiagnosticCategory::InvalidCharacter,
        )),
    ),
    (
        r##"{"#literal": @ 1}"##,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
            LexerDiagnosticCategory::InvalidCharacter,
        )),
    ),
    (
        r##"{"#literal": 1 @ "#type": "Int"}"##,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
            LexerDiagnosticCategory::InvalidCharacter,
        )),
    ),
    (
        r#"["f" @ "x"]"#,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
            LexerDiagnosticCategory::InvalidCharacter,
        )),
    ),
    (
        r#"["f", @ "x"]"#,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
            LexerDiagnosticCategory::InvalidCharacter,
        )),
    ),
    (
        r#"["f", @]"#,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
            LexerDiagnosticCategory::InvalidCharacter,
        )),
    ),
    (
        r##"{"#dict": [@ [{"#literal": 1}, {"#literal": 2}]]}"##,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
            LexerDiagnosticCategory::InvalidCharacter,
        )),
    ),
    (
        "*/",
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
            LexerDiagnosticCategory::InvalidCharacter,
        )),
    ),
    (
        r##"{"#literal": -Infinity}"##,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
            LexerDiagnosticCategory::InvalidToken,
        )),
    ),
    (
        r##"{"#literal": 0x10}"##,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
            LexerDiagnosticCategory::InvalidNumber,
        )),
    ),
    // The end of input is reported once, whatever it cut short.
    (
        r##"{"#literal": "unterminated}"##,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
            LexerDiagnosticCategory::InvalidString,
        )),
    ),
    (
        r#"["f", // comment"#,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
            LexerDiagnosticCategory::UnexpectedEof,
        )),
    ),
];

#[test]
fn single_error_without_cascade() {
    for &(input, expected) in SINGLE_ERROR_CASES {
        let categories = parse_err_categories(input);
        assert_eq!(
            categories[0], expected,
            "primary diagnostic mismatch for {input}: got {categories:?}"
        );
        assert_eq!(
            categories.len(),
            1,
            "unexpected cascade diagnostics for {input}: {categories:?}"
        );
    }
}

#[test]
fn literal_number_kind() {
    for (number, kind) in [
        ("0", "Integer"),
        ("-42", "Integer"),
        ("1.0", "Float"),
        ("1e5", "Float"),
        ("1E5", "Float"),
        ("-1.5e-3", "Float"),
    ] {
        let dump = parse_ok_dump(&format!(r##"{{"#literal": {number}}}"##));
        assert!(
            dump.contains(&format!("Primitive ({kind})")),
            "`{number}` is not lowered to {kind}:\n{dump}"
        );
    }
}

#[test]
fn eof_after_mismatched_value() {
    // The array is the wrong value for `#literal` and is cut short by the end of input, which
    // both the array and the object around it report.
    assert_eq!(
        parse_err_categories(r##"{"#literal": [1, 2"##),
        [
            JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Object(
                ObjectDiagnosticCategory::LiteralExpectedPrimitive
            )),
            JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
                LexerDiagnosticCategory::UnexpectedEof
            )),
        ]
    );
}

#[test]
fn leading_invalid_token() {
    // The parser still reads the document after the byte order mark and reports the error in it.
    assert_eq!(
        parse_err_categories("\u{feff}[\"f\", 1]"),
        [
            JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
                LexerDiagnosticCategory::InvalidCharacter
            )),
            JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
                LexerDiagnosticCategory::UnexpectedToken
            )),
        ]
    );

    // No expression precedes the `]`, which is reported as a token that starts none.
    assert_eq!(
        parse_err_categories("@ ]"),
        [
            JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
                LexerDiagnosticCategory::InvalidCharacter
            )),
            JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
                LexerDiagnosticCategory::UnexpectedToken
            )),
        ]
    );
}

/// Source text a span covers.
fn span_text<'source>(source: &'source str, spans: &SpanTable<Span>, span: SpanId) -> &'source str {
    let range = spans
        .absolute(span)
        .expect("span resolves to a source range")
        .range();

    source
        .get(usize::from(range.start())..usize::from(range.end()))
        .expect("span lies on character boundaries of the source")
}

#[test]
fn escaped_string_spans() {
    let heap = Heap::new();

    let source = r#""\u0061.bb""#;
    let mut spans = SpanTable::new(SourceId::new_unchecked(0));
    let expr = Parser::new(&heap, &mut spans, ParserOptions::default())
        .parse_expr_in(source, Global)
        .expect("field access parses")
        .value;
    let ExprKind::Field(field) = &expr.kind else {
        panic!("expected a field access, got {:?}", expr.kind);
    };
    assert_eq!(span_text(source, &spans, field.value.span), r"\u0061");
    assert_eq!(span_text(source, &spans, field.field.span), "bb");
    assert_eq!(span_text(source, &spans, field.span), r"\u0061.bb");

    // The escaped `.` has an escape on either side, with no unescaped byte to count from.
    let source = r#""\u0061\u002e\u0062\u0062""#;
    let mut spans = SpanTable::new(SourceId::new_unchecked(0));
    let expr = Parser::new(&heap, &mut spans, ParserOptions::default())
        .parse_expr_in(source, Global)
        .expect("field access parses")
        .value;
    let ExprKind::Field(field) = &expr.kind else {
        panic!("expected a field access, got {:?}", expr.kind);
    };
    assert_eq!(span_text(source, &spans, field.value.span), r"\u0061");
    assert_eq!(span_text(source, &spans, field.field.span), r"\u0062\u0062");

    let source =
        r##"{"#struct": {"\u0061\ud800\udc00b": {"#literal": 1}}, "#type": "\u0049nt<T\u0055>"}"##;
    let mut spans = SpanTable::new(SourceId::new_unchecked(0));
    let expr = Parser::new(&heap, &mut spans, ParserOptions::default())
        .parse_expr_in(source, Global)
        .expect("typed struct parses")
        .value;
    let ExprKind::Struct(r#struct) = &expr.kind else {
        panic!("expected a struct, got {:?}", expr.kind);
    };
    assert_eq!(
        span_text(source, &spans, r#struct.entries[0].key.span),
        r"\u0061\ud800\udc00b"
    );
    let r#type = r#struct.r#type.as_ref().expect("struct has a type");
    let TypeKind::Path(path) = &r#type.kind else {
        panic!("expected a path type, got {:?}", r#type.kind);
    };
    assert_eq!(span_text(source, &spans, path.span), r"\u0049nt<T\u0055>");
    assert_eq!(
        span_text(source, &spans, path.segments[0].name.span),
        r"\u0049nt"
    );
    assert_eq!(
        span_text(source, &spans, path.segments[0].arguments[0].span()),
        r"T\u0055"
    );

    let source = r#"["f", ":\u0061b"]"#;
    let mut spans = SpanTable::new(SourceId::new_unchecked(0));
    let expr = Parser::new(&heap, &mut spans, ParserOptions::default())
        .parse_expr_in(source, Global)
        .expect("shorthand labeled argument parses")
        .value;
    let ExprKind::Call(call) = &expr.kind else {
        panic!("expected a call, got {:?}", expr.kind);
    };
    assert_eq!(
        span_text(source, &spans, call.labeled_arguments[0].label.span),
        r"\u0061b"
    );
}

/// `open`, repeated `depth` times around `leaf` and closed by as many `close`.
fn nest(open: &str, leaf: &str, close: &str, depth: usize) -> String {
    let mut source = String::with_capacity((open.len() + close.len()) * depth + leaf.len());
    source.extend(iter::repeat_n(open, depth));
    source.push_str(leaf);
    source.extend(iter::repeat_n(close, depth));
    source
}

/// Containers that nest an expression in themselves, with the delimiters that close them.
const NESTING_SHAPES: &[(&str, &str)] = &[
    ("[", "]"),
    (r#"["f", "#, "]"),
    (r##"{"#struct": {"a": "##, "}}"),
    (r##"{"#tuple": ["##, "]}"),
    (r##"{"#list": ["##, "]}"),
    (r##"{"#dict": {"k": "##, "}}"),
    (r##"{"#dict": [["k", "##, "]]}"),
];

const NESTING_LIMIT_CATEGORY: JExprDiagnosticCategory =
    JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::NestingLimit);

fn default_nesting_limit() -> usize {
    usize::from(ParserOptions::default().nesting_limit)
}

#[test]
fn nesting_at_limit() {
    for &(open, close) in NESTING_SHAPES {
        let source = nest(open, r#""x""#, close, default_nesting_limit());

        let heap = Heap::new();
        let mut spans = SpanTable::new(SourceId::new_unchecked(0));
        let result =
            Parser::new(&heap, &mut spans, ParserOptions::default()).parse_expr_in(&source, Global);
        assert!(result.is_ok(), "`{open}` nested to the limit is rejected");
    }
}

#[test]
fn nesting_on_small_stack() {
    // Parsing and lowering to the limit need more stack than this thread has.
    const STACK_SIZE: usize = 128 * 1024;

    let sources = NESTING_SHAPES
        .iter()
        .map(|&(open, close)| nest(open, r#""x""#, close, default_nesting_limit()))
        .chain(
            EMBEDDED_NESTING_SHAPES
                .iter()
                .map(|&(open, leaf, close, category)| {
                    let body = nest(open, leaf, close, default_nesting_limit() - 1);
                    embedded_source(category, &body)
                }),
        );

    for source in sources {
        let parsed = thread::Builder::new()
            .stack_size(STACK_SIZE)
            .spawn(move || {
                let heap = Heap::new();
                let mut spans = SpanTable::new(SourceId::new_unchecked(0));
                let (status, pointers) = Parser::new(&heap, &mut spans, ParserOptions::default())
                    .parse_expr_with_pointers_in(&source, Global);

                // Dropping the syntax tree and the AST recurses once per node in drop glue, which
                // cannot grow the stack.
                let leaked = ManuallyDrop::new((status, pointers));

                leaked.0.is_ok()
            })
            .expect("thread spawns")
            .join()
            .expect("parser does not panic");

        assert!(parsed);
    }
}

#[test]
fn nesting_past_limit() {
    // The larger depth overflows the stack of a parser that recurses once per container.
    for depth in [default_nesting_limit() + 1, 10_000] {
        for &(open, close) in NESTING_SHAPES {
            let source = nest(open, r#""x""#, close, depth);

            let parse = parse_expr_cst(&source);
            assert_eq!(parse.green().to_string(), source);
            assert_eq!(
                parse_err_categories(&source),
                [NESTING_LIMIT_CATEGORY],
                "`{open}` nested {depth} deep"
            );
        }
    }
}

#[test]
fn recovery_nesting_past_limit() {
    // A value of the wrong kind is skipped as plain JSON, which nests as well.
    for (open, close) in [("[", "]"), (r#"{"a": "#, "}")] {
        let value = nest(open, "1", close, 10_000);
        let source = format!(r##"{{"#literal": {value}}}"##);

        let parse = parse_expr_cst(&source);
        assert_eq!(parse.green().to_string(), source);
        assert_eq!(
            parse_err_categories(&source),
            [
                JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Object(
                    ObjectDiagnosticCategory::LiteralExpectedPrimitive
                )),
                NESTING_LIMIT_CATEGORY,
            ]
        );
    }
}

#[test]
fn unclosed_nesting_past_limit() {
    // The skipped containers are not closed, and the containers above the limit still report it.
    let source = "[".repeat(default_nesting_limit() + 50);

    let parse = parse_expr_cst(&source);
    assert_eq!(parse.green().to_string(), source);
    assert_eq!(
        parse_err_categories(&source),
        [
            NESTING_LIMIT_CATEGORY,
            JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Lexer(
                LexerDiagnosticCategory::UnexpectedEof
            )),
        ]
    );
}

/// Strings whose embedded type or expression nests in itself, as the open and close of one level
/// and the innermost text.
const EMBEDDED_NESTING_SHAPES: &[(&str, &str, &str, StringDiagnosticCategory)] = &[
    ("(a: ", "Int", ")", StringDiagnosticCategory::InvalidType),
    ("(", "Int", ",)", StringDiagnosticCategory::InvalidType),
    ("List<", "Int", ">", StringDiagnosticCategory::InvalidType),
    ("a[", "a", "]", StringDiagnosticCategory::InvalidExpression),
];

fn embedded_source(category: StringDiagnosticCategory, body: &str) -> String {
    match category {
        StringDiagnosticCategory::InvalidType => {
            format!(r##"{{"#literal": 1, "#type": "{body}"}}"##)
        }
        StringDiagnosticCategory::InvalidExpression => format!(r#""{body}""#),
    }
}

#[test]
fn embedded_nesting_at_limit() {
    for &(open, leaf, close, category) in EMBEDDED_NESTING_SHAPES {
        // The innermost type or expression is a level of its own.
        let body = nest(open, leaf, close, default_nesting_limit() - 1);
        let source = embedded_source(category, &body);

        let heap = Heap::new();
        let mut spans = SpanTable::new(SourceId::new_unchecked(0));
        let result =
            Parser::new(&heap, &mut spans, ParserOptions::default()).parse_expr_in(&source, Global);
        assert!(result.is_ok(), "`{open}` nested to the limit is rejected");
    }

    let source = format!(r#""a{}""#, ".b".repeat(default_nesting_limit() - 1));
    let heap = Heap::new();
    let mut spans = SpanTable::new(SourceId::new_unchecked(0));
    let result =
        Parser::new(&heap, &mut spans, ParserOptions::default()).parse_expr_in(&source, Global);
    assert!(
        result.is_ok(),
        "field accesses nested to the limit are rejected"
    );
}

#[test]
fn embedded_nesting_past_limit() {
    for depth in [default_nesting_limit(), 10_000] {
        for &(open, leaf, close, category) in EMBEDDED_NESTING_SHAPES {
            let body = nest(open, leaf, close, depth);
            let source = embedded_source(category, &body);

            assert_eq!(
                parse_err_categories(&source),
                [JExprDiagnosticCategory::Parser(
                    ParserDiagnosticCategory::String(category)
                )],
                "`{open}` nested {depth} deep"
            );
        }

        // A chain of accesses is flat in the source and nests in the AST.
        let source = format!(r#""a{}""#, ".b".repeat(depth));
        assert_eq!(
            parse_err_categories(&source),
            [JExprDiagnosticCategory::Parser(
                ParserDiagnosticCategory::String(StringDiagnosticCategory::InvalidExpression)
            )]
        );
    }
}

#[test]
fn nesting_custom_limit() {
    const OPTIONS: ParserOptions = ParserOptions { nesting_limit: 3 };

    let limit = usize::from(OPTIONS.nesting_limit);
    let parse = |source: &str| {
        let heap = Heap::new();
        let mut spans = SpanTable::new(SourceId::new_unchecked(0));

        Parser::new(&heap, &mut spans, OPTIONS)
            .parse_expr_in(source, Global)
            .map(drop)
            .map_err(|failure| failure.primary.category)
    };

    for &(open, close) in NESTING_SHAPES {
        assert_eq!(
            parse(&nest(open, r#""x""#, close, limit)),
            Ok(()),
            "`{open}` nested to the limit"
        );
        assert_eq!(
            parse(&nest(open, r#""x""#, close, limit + 1)),
            Err(NESTING_LIMIT_CATEGORY),
            "`{open}` nested past the limit"
        );
    }

    // The innermost type or expression is a level of its own.
    let embedded = EMBEDDED_NESTING_SHAPES
        .iter()
        .map(|&(open, leaf, close, category)| {
            let source = |depth| embedded_source(category, &nest(open, leaf, close, depth));
            (source(limit - 1), source(limit), category)
        })
        .chain([(
            format!(r#""a{}""#, ".b".repeat(limit - 1)),
            format!(r#""a{}""#, ".b".repeat(limit)),
            StringDiagnosticCategory::InvalidExpression,
        )]);

    for (at_limit, past_limit, category) in embedded {
        assert_eq!(parse(&at_limit), Ok(()), "`{at_limit}` is at the limit");
        assert_eq!(
            parse(&past_limit),
            Err(JExprDiagnosticCategory::Parser(
                ParserDiagnosticCategory::String(category)
            )),
            "`{past_limit}` is past the limit"
        );
    }

    // A string counts its levels from zero, at the deepest level of the document as well.
    let innermost = format!(r#""{}""#, nest("a[", "a", "]", limit - 1));
    assert_eq!(parse(&nest("[", &innermost, "]", limit)), Ok(()));
}

#[test]
fn value_grammar_type_annotation() {
    #[derive(Debug, Copy, Clone, PartialEq, Eq)]
    enum ValueNode<'tree> {
        Literal(cst::Literal<'tree>),
        Struct(cst::Struct<'tree, Self>),
    }

    impl<'tree> Node<'tree> for ValueNode<'tree> {
        const SYNTAX_KINDS: SyntaxKindSet = SyntaxKindSet::from_union(&[
            cst::Literal::SYNTAX_KINDS,
            cst::Struct::<Self>::SYNTAX_KINDS,
        ]);

        #[expect(
            clippy::wildcard_enum_match_arm,
            reason = "test grammar handles only Literal and Struct nodes"
        )]
        fn cast(syntax: cst::SyntaxNodeData<'tree>) -> Option<Self> {
            match syntax.kind() {
                SyntaxKind::Literal => cst::Literal::cast(syntax).map(Self::Literal),
                SyntaxKind::Struct => cst::Struct::cast(syntax).map(Self::Struct),
                _ => None,
            }
        }

        fn syntax(self) -> cst::SyntaxNodeData<'tree> {
            match self {
                Self::Literal(node) => node.syntax(),
                Self::Struct(node) => node.syntax(),
            }
        }
    }

    struct ValueRoot(!);

    impl TreeRoot for ValueRoot {
        type Item<'tree> = ValueNode<'tree>;
    }

    struct ValueGrammar;

    impl Grammar for ValueGrammar {
        type Root = ValueRoot;

        const ALLOW_TYPE_ANNOTATIONS: bool = false;
        const ITEM_FIRST: SyntaxKindSet = SyntaxKindSet::from_kind(T!['{']);

        fn parse_item<A>(parser: &mut parser::Parser<'_, Self, A>)
        where
            A: Allocator + Clone,
        {
            if parser.at(T!['{']) {
                parser::object::parse_object(parser);
            } else {
                parser::recovery::recover_unexpected_item(parser);
            }
        }
    }

    let ok = parser::Parser::<ValueGrammar, Global>::parse_cst_in(
        r##"{"#struct": {"x": {"#literal": 7}}}"##,
        ParserOptions::default(),
        Global,
    );
    assert!(ok.is_valid(), "errors: {:?}", ok.errors());
    assert!(matches!(ok.tree().item(), Some(ValueNode::Struct(_))));

    let rejected = parser::Parser::<ValueGrammar, Global>::parse_cst_in(
        r##"{"#struct": {}, "#type": "Point"}"##,
        ParserOptions::default(),
        Global,
    );
    let [error] = rejected.errors() else {
        panic!("expected one error, got {:?}", rejected.errors());
    };

    let heap = Heap::new();
    let mut spans = SpanTable::new(SourceId::new_unchecked(0));
    assert_eq!(
        error.to_diagnostic_in(&heap, &mut spans).category,
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Object(
            ObjectDiagnosticCategory::UnknownKey
        ))
    );
}

#[property_test]
fn lossless_arbitrary_input(input: String) {
    let parse = parse_expr_cst(&input);
    prop_assert_eq!(parse.green().to_string(), input.as_str());

    let heap = Heap::new();
    let mut spans = SpanTable::new(SourceId::new_unchecked(0));
    let status = lower::lower_expr_in(&heap, &mut spans, ParserOptions::default(), &parse, Global);
    if !parse.is_valid() {
        prop_assert!(status.is_err());
    }
}

#[property_test]
fn lossless_generated_tokens(
    #[strategy = r#"(\{|\}|\[|\]|:|,|"(#literal|#struct|#tuple|#list|#dict|#type|:a|foo|\\z|)"|42|3\.14|42\.|true|false|null|/\*.*\*/|//[^\n]*\n|[ \t\n]){0,40}"#]
    input: String,
) {
    let parse = parse_expr_cst(&input);
    prop_assert_eq!(parse.green().to_string(), input.as_str());

    let heap = Heap::new();
    let mut spans = SpanTable::new(SourceId::new_unchecked(0));
    let status = lower::lower_expr_in(&heap, &mut spans, ParserOptions::default(), &parse, Global);
    if !parse.is_valid() {
        prop_assert!(status.is_err());
    }
}
