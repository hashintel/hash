use hashql_core::{heap::Heap, span::SpanTable};
use hashql_diagnostics::{
    diagnostic::render::{ColorDepth, Format, RenderOptions},
    source::{Source, SourceId, Sources},
};

use crate::Parser;

fn render_errors(input: &str) -> String {
    let heap = Heap::new();
    let mut spans = SpanTable::new(SourceId::new_unchecked(0));
    let mut parser = Parser::new(&heap, &mut spans);

    let failure = parser
        .parse_expr(input)
        .expect_err("expected input to produce at least one diagnostic");

    let mut sources = Sources::new();
    sources.push(Source::new(input));

    let mut options = RenderOptions::new(Format::Ansi, &sources);
    options.color_depth = ColorDepth::Monochrome;

    failure.into_issues().render(options, &mut &spans)
}

macro_rules! diagnostic_snapshots {
    ($($name:ident => $input:expr,)*) => {
        $(
            #[test]
            fn $name() {
                let input = $input;
                let rendered = render_errors(input);
                ::insta::with_settings!({
                    prepend_module_to_snapshot => false,
                }, {
                    ::insta::assert_snapshot!(stringify!($name), rendered, input);
                });
            }
        )*
    };
}

diagnostic_snapshots! {
    // String lex errors
    string_unknown_escape => r##"{"#literal": "hello\zworld"}"##,
    string_unnecessary_single_quote_escape => r##"{"#literal": "it\'s"}"##,
    string_null_escape => r##"{"#literal": "a\0b"}"##,
    string_hex_escape_prefix => r##"{"#literal": "\x1b"}"##,
    string_invalid_hex_digit => r##"{"#literal": "hello\u12g4"}"##,
    string_unpaired_low_surrogate => r##"{"#literal": "\uDC00"}"##,
    string_unpaired_high_surrogate => r##"{"#literal": "\uD800"}"##,
    string_invalid_low_surrogate => r##"{"#literal": "\uD800\u1234"}"##,
    string_unescaped_newline => "{\"#literal\": \"a\nb\"}",
    string_unescaped_tab => "{\"#literal\": \"a\tb\"}",
    string_unescaped_control_other => "{\"#literal\": \"a\x07b\"}",
    string_unterminated => r##"{"#literal": "unterminated"##,
    string_unterminated_swallows_brace => r##"{"#literal": "unterminated}"##,
    string_incomplete_escape_eof => r##"{"#literal": "abc\u12"##,
    string_single_quoted => r##"{"#literal": 'hello'}"##,
    string_single_quoted_with_escapes => r##"{"#literal": 'it\'s "ok"'}"##,

    // Number lex errors
    number_trailing_dot => r##"{"#literal": 42.}"##,
    number_leading_zero => r##"{"#literal": 007}"##,
    number_negative_leading_zero => r##"{"#literal": -042}"##,
    number_leading_plus => r##"{"#literal": +42}"##,
    number_leading_dot => r##"{"#literal": .5}"##,
    number_duplicate_dot => r##"{"#literal": 1.2.3}"##,
    number_dot_in_exponent => r##"{"#literal": 1e2.3}"##,
    number_duplicate_exponent => r##"{"#literal": 1e2e3}"##,
    number_missing_exponent_digits => r##"{"#literal": 1e+}"##,
    number_bare_minus => r##"{"#literal": -}"##,

    // Character, token, and comment lex errors
    invalid_character => "{\"#literal\": \u{1f980}}",
    invalid_token_keyword_typo => r##"{"#literal": truex}"##,
    invalid_token_keyword_case => r##"{"#literal": True}"##,
    invalid_token_none => r##"{"#literal": None}"##,
    invalid_token_nan => r##"{"#literal": NaN}"##,
    invalid_token_bare_ident => r#"["add", x]"#,
    unterminated_block_comment => "/* unclosed",

    // EOF and delimiter errors
    eof_empty_document => "",
    eof_unclosed_array => r##"["add", {"#literal": 1}"##,
    eof_nested_unclosed_delimiters => r##"["add", {"#struct": {"a": {"#literal": 1}"##,
    eof_missing_field_colon => r##"{"#literal""##,
    eof_missing_field_value => r##"{"#literal":"##,
    mismatched_closing_brace_in_array => r#"["a"}"#,
    mismatched_closing_bracket_in_object => r##"{"#literal": 1]"##,
    missing_comma_array => r#"["a" "b"]"#,
    missing_comma_array_multiline => "[\n  \"a\"\n  \"b\"\n]",
    missing_comma_object => r##"{"#literal": 1 "#type": "Int"}"##,
    missing_colon_object => r##"{"#literal" 42}"##,
    bare_primitive_in_expr => r#"["add", 1, 2]"#,
    non_string_object_key => "{42: 1}",
    trailing_content_after_expr => r#"["a"] "extra""#,

    // Array and labeled argument errors
    empty_array => "[]",
    array_leading_comma => r#"[, "a"]"#,
    array_trailing_comma => r#"["a",]"#,
    array_consecutive_commas => r#"["a",,, "b"]"#,
    labeled_arg_multi_split => r#"["fn", {":a": "x", ":b": "y"}]"#,
    labeled_arg_missing_prefix => r#"["fn", {":a": "x", "b": "y"}]"#,
    labeled_arg_empty_name => r#"["fn", ":"]"#,
    labeled_arg_invalid_ident => r#"["fn", ":123bad"]"#,

    // Object and constructor errors
    empty_object => "{}",
    object_leading_comma => r##"{, "#literal": 1}"##,
    object_trailing_comma => r##"{"#literal": 1,}"##,
    object_consecutive_commas => r##"{"#literal": 1,, "#type": "Int"}"##,
    object_consecutive_colons => r##"{"#struct": {"a":: {"#literal": 1}}}"##,
    unknown_key_typo => r##"{"#litral": 42}"##,
    unknown_key_missing_hash => r#"{"literal": 42}"#,
    unknown_key_plain_object => r##"{"name": {"#literal": "Ada"}}"##,
    unknown_key_extra_after_full => r##"{"#literal": 1, "#type": "Int", "extra": 2}"##,
    conflicting_constructors => r##"{"#literal": 1, "#list": []}"##,
    duplicate_key => r##"{"#literal": 1, "#literal": 2}"##,
    orphaned_type => r##"{"#type": "Int"}"##,
    struct_expected_object => r##"{"#struct": [1]}"##,
    struct_missing_value => r##"{"#struct": }"##,
    struct_key_invalid_ident => r##"{"#struct": {"123bad": {"#literal": 1}}}"##,
    struct_key_empty => r##"{"#struct": {"": {"#literal": 1}}}"##,
    tuple_expected_array => r##"{"#tuple": {}}"##,
    list_expected_array => r##"{"#list": {}}"##,
    dict_expected_format => r##"{"#dict": "invalid"}"##,
    dict_entry_expected_array => r##"{"#dict": [{"not": "array"}]}"##,
    dict_entry_too_few_0 => r##"{"#dict": [[]]}"##,
    dict_entry_too_few_1 => r##"{"#dict": [[{"#literal": "k"}]]}"##,
    dict_entry_too_many => r##"{"#dict": [[{"#literal": "k"}, {"#literal": "v"}, {"#literal": "x"}]]}"##,
    type_expected_string => r##"{"#literal": 1, "#type": 42}"##,
    literal_expected_primitive_array => r##"{"#literal": [1, 2]}"##,
    literal_expected_primitive_object => r##"{"#literal": {"a": 1}}"##,

    // Embedded DSL errors
    embedded_expr_empty => r#""""#,
    embedded_expr_bad_char => r#""foo$bar""#,
    embedded_expr_escaped_bad_char => r#""foo\u0024bar""#,
    embedded_expr_unclosed_bracket => r#""foo[0""#,
    embedded_type_empty => r##"{"#literal": 1, "#type": ""}"##,
    embedded_type_missing_colon => r##"{"#literal": 1, "#type": "(name: String, age Int)"}"##,
    embedded_type_unclosed_generic => r##"{"#literal": 1, "#type": "List<Int"}"##,
    embedded_type_unclosed_tuple => r##"{"#literal": 1, "#type": "(Int, String"}"##,
}
