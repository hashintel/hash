//! Expression grammar (`ExprGrammar`) for paths, function calls, and constructor objects.

use text_size::TextRange;

use super::{
    Grammar, Parser, object,
    recovery::{self, ContainerStep},
};
use crate::{
    cst,
    error::SyntaxErrorKind,
    syntax_kind::{SyntaxKind, T},
    syntax_kind_set::SyntaxKindSet,
};

/// Grammar specialization for J-Expr expressions (paths, calls, and typed data constructors).
pub(crate) struct ExprGrammar;

impl Grammar for ExprGrammar {
    type Root = cst::ExprRoot;

    const ALLOW_TYPE_ANNOTATIONS: bool = true;
    const ITEM_FIRST: SyntaxKindSet = SyntaxKindSet::from_slice(&[T![string], T!['['], T!['{']]);

    fn parse_item(parser: &mut Parser<'_, Self>) {
        parse_expr(parser);
    }
}

/// Parses one J-Expr expression into `parser`.
pub(crate) fn parse_expr(parser: &mut Parser<'_, ExprGrammar>) {
    let Some(token) = parser.current() else {
        let eof = parser.eof_range();
        parser.error(
            eof,
            SyntaxErrorKind::UnexpectedEof {
                expected: ExprGrammar::ITEM_FIRST,
            },
        );
        return;
    };

    if token.kind == T![string] {
        parser.start_node(SyntaxKind::PathExpr);
        parser.bump(T![string]);
        parser.finish_node();
    } else if token.kind == T!['['] {
        parse_call(parser);
    } else if token.kind == T!['{'] {
        object::parse_object(parser);
    } else {
        recovery::recover_unexpected_item(parser);
    }
}

fn parse_call(parser: &mut Parser<'_, ExprGrammar>) {
    parser.start_node(SyntaxKind::CallExpr);
    let open = parser.bump(T!['[']).range;
    let err_start = parser.error_count();

    let mut count = 0_usize;
    loop {
        match recovery::next_array_element(parser, count, |kind| {
            ExprGrammar::ITEM_FIRST.contains(kind)
        }) {
            ContainerStep::Closed | ContainerStep::Aborted => break,
            ContainerStep::Item => {
                if count == 0 {
                    parse_expr(parser);
                } else {
                    parse_call_arg(parser);
                }
                count += 1;
            }
        }
    }

    if count == 0 && parser.error_count() == err_start {
        let range = TextRange::new(open.start(), parser.last_token_end());
        parser.error(range, SyntaxErrorKind::EmptyArray);
    }

    parser.finish_node();
}

fn parse_call_arg(parser: &mut Parser<'_, ExprGrammar>) {
    let Some(first) = parser.current() else {
        return;
    };

    // Shorthand labeled argument: `":label"`, excluding rooted paths starting with `"::"`.
    if first.kind == T![string]
        && let Some(decoded) = parser.decode_string(first)
        && decoded.starts_with(':')
        && !decoded.starts_with("::")
    {
        parser.start_node(SyntaxKind::ShorthandLabeledArg);
        parser.bump(T![string]);
        parser.finish_node();
        return;
    }

    // Object-form labeled argument: LL(2) check for `{` followed by a `":..."` key string.
    if first.kind == T!['{']
        && let Some(second) = parser.peek2()
        && second.kind == T![string]
        && let Some(decoded) = parser.decode_string(second)
        && decoded.starts_with(':')
    {
        parse_labeled_arg(parser);
        return;
    }

    parser.start_node(SyntaxKind::PositionalArg);
    parse_expr(parser);
    parser.finish_node();
}

fn parse_labeled_arg(parser: &mut Parser<'_, ExprGrammar>) {
    parser.start_node(SyntaxKind::LabeledArg);
    let open = parser.bump(T!['{']).range;

    let mut entry_ranges = Vec::new();
    let mut index = 0_usize;

    loop {
        match recovery::next_object_entry(parser, index) {
            ContainerStep::Closed | ContainerStep::Aborted => break,
            ContainerStep::Item => {
                index += 1;
                parser.start_node(SyntaxKind::LabeledArgEntry);
                let key = parser.bump(T![string]);

                if let Some(decoded) = parser.decode_string(key)
                    && !decoded.starts_with(':')
                {
                    parser.error(
                        key.range,
                        SyntaxErrorKind::LabeledArgumentMissingPrefix {
                            actual: decoded.into_owned(),
                        },
                    );
                }

                if recovery::expect_colon(parser) {
                    parse_expr(parser);
                }

                let entry_range = TextRange::new(key.range.start(), parser.last_token_end());
                entry_ranges.push(entry_range);
                parser.finish_node();
            }
        }
    }

    if entry_ranges.len() != 1 {
        let object_range = TextRange::new(open.start(), parser.last_token_end());
        let extra = entry_ranges.iter().skip(1).copied().collect();
        parser.error(
            object_range,
            SyntaxErrorKind::LabeledArgumentLengthMismatch {
                extra,
                count: entry_ranges.len(),
            },
        );
    }

    parser.finish_node();
}
