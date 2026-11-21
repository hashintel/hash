use hashql_ast::format::SyntaxDump as _;
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
    JExprDiagnosticCategory, Parser,
    cst::{self, Node, Token as _, TreeRoot},
    error::{
        ArrayDiagnosticCategory, LexerDiagnosticCategory, ObjectDiagnosticCategory,
        ParserDiagnosticCategory, StringDiagnosticCategory,
    },
    parser::{self, Grammar},
    span::Span,
    syntax_kind::{SyntaxKind, T},
    syntax_kind_set::SyntaxKindSet,
};

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
    let mut parser = Parser::new(&heap, &mut spans);

    match parser.parse_expr(input) {
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
    let mut parser = Parser::new(&heap, &mut spans);

    match parser.parse_expr(input) {
        Ok(_) => panic!("expected `{input}` to fail parsing"),
        Err(Failure { primary, secondary }) => {
            let mut categories = vec![primary.category];
            categories.extend(secondary.iter().map(|diag| diag.category));
            // Verify every produced diagnostic renders cleanly against `input` and `spans`.
            let rendered_primary = render_diagnostic(input, &primary, &spans);
            assert_ne!(rendered_primary, "");
            for diag in secondary.iter() {
                assert_ne!(render_diagnostic(input, diag, &spans), "");
            }
            categories
        }
    }
}

#[test]
fn lossless_round_trip_and_trivia_trimming() {
    let source = "// head\n  { /* c1 **/\n  \"#type\": \"Int\", /* c2 */ \"#literal\": 42 // \
                  inline\n} // tail";
    let parse = Parser::parse_expr_cst(source);
    assert!(parse.is_valid(), "unexpected errors: {:?}", parse.errors());
    assert_eq!(parse.green().to_string(), source);
    assert_eq!(parse.syntax().text().to_string(), source);

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
            .any(|tok| tok.kind() == SyntaxKind::LineComment)
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
        let dump_before = parse_ok_dump(before);
        let dump_after = parse_ok_dump(after);
        assert!(dump_before.contains("Type"));
        assert!(dump_after.contains("Type"));
    }
}

#[test]
fn call_arguments_and_escaped_keys() {
    let source = r##"["greet", "::core::id", {":name": {"#literal": "Alice"}}, ":age", {"\u0023literal": true}, {"\u003aflag": {"#literal": null}}]"##;
    let parse = Parser::parse_expr_cst(source);
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
fn generic_value_grammar_rejects_type_annotations() {
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

        fn parse_item(parser: &mut parser::Parser<'_, Self>) {
            if parser.at(T!['{']) {
                parser::object::parse_object(parser);
            } else {
                parser::recovery::recover_unexpected_item(parser);
            }
        }
    }

    let ok = parser::Parser::<ValueGrammar>::parse_cst(r##"{"#struct": {"x": {"#literal": 7}}}"##);
    assert!(ok.is_valid(), "errors: {:?}", ok.errors());
    assert!(matches!(ok.tree().item(), Some(ValueNode::Struct(_))));

    let rejected =
        parser::Parser::<ValueGrammar>::parse_cst(r##"{"#struct": {}, "#type": "Point"}"##);
    assert_eq!(rejected.errors().len(), 1);
    assert_eq!(
        rejected.errors()[0].category(),
        JExprDiagnosticCategory::Parser(ParserDiagnosticCategory::Object(
            ObjectDiagnosticCategory::UnknownKey
        ))
    );
}

#[property_test]
fn arbitrary_input_is_lossless_and_never_panics(input: String) {
    let parse = Parser::parse_expr_cst(&input);
    prop_assert_eq!(parse.green().to_string(), input.as_str());

    let heap = Heap::new();
    let mut spans = SpanTable::new(SourceId::new_unchecked(0));
    let status = Parser::new(&heap, &mut spans).lower_expr(&parse);
    if !parse.is_valid() {
        prop_assert!(status.is_err());
    }
}

#[property_test]
fn structured_random_jexpr_tokens_are_lossless(
    #[strategy = r#"(\{|\}|\[|\]|:|,|"(#literal|#struct|#tuple|#list|#dict|#type|:a|foo|\\z|)"|42|3\.14|42\.|true|false|null|/\*.*\*/|//[^\n]*\n|[ \t\n]){0,40}"#]
    input: String,
) {
    let parse = Parser::parse_expr_cst(&input);
    prop_assert_eq!(parse.green().to_string(), input.as_str());

    let heap = Heap::new();
    let mut spans = SpanTable::new(SourceId::new_unchecked(0));
    let status = Parser::new(&heap, &mut spans).lower_expr(&parse);
    if !parse.is_valid() {
        prop_assert!(status.is_err());
    }
}
