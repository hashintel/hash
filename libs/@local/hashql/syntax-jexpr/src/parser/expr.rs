use core::ops::ControlFlow;

use text_size::TextRange;

use super::{
    Grammar, Parser,
    object::{self, OpenObject},
    recovery::{self, Item},
};
use crate::{
    cst,
    error::{ArrayErrorKind, EofContext, SyntaxErrorKind},
    syntax_kind::{SyntaxKind, T},
    syntax_kind_set::SyntaxKindSet,
};

pub(crate) struct ExprGrammar;

fn parse_labeled_arg_after_open(
    parser: &mut Parser<'_, ExprGrammar>,
    OpenObject {
        checkpoint,
        open,
        err_start,
    }: OpenObject,
) {
    let mut entry_ranges = Vec::new();
    let mut commas = Vec::new();
    let mut all_prefixed = true;
    let mut index = 0_usize;

    while let ControlFlow::Continue(Item { separator }) =
        recovery::next_object_entry(parser, open, index)
    {
        if let Some(comma) = separator {
            commas.push(comma);
        }
        index += 1;
        parser.start_node(SyntaxKind::LabeledArgEntry);
        let key = parser.bump(T![string]);

        if let Some(decoded) = key.decode_string() {
            if !decoded.starts_with(':') {
                all_prefixed = false;
                parser.error(
                    key.range,
                    SyntaxErrorKind::Array(ArrayErrorKind::LabeledArgumentMissingPrefix {
                        actual: decoded.into_owned(),
                    }),
                );
            }
        } else {
            all_prefixed = false;
        }

        if recovery::expect_colon(parser, key.range) {
            parse_expr(parser);
        }

        let entry_range = TextRange::new(key.range.start(), parser.last_token_end());
        entry_ranges.push(entry_range);
        parser.finish_node();
    }

    if entry_ranges.len() != 1 {
        let count = entry_ranges.len();
        let (primary_range, first_entry, extra) = if let Some((&first, rest)) =
            entry_ranges.split_first()
            && let Some((&second, tail)) = rest.split_first()
        {
            (second, Some(first), tail.to_vec())
        } else {
            let object_range = TextRange::new(open.start(), parser.last_token_end());
            (object_range, None, Vec::new())
        };

        let split_comma =
            (count == 2 && all_prefixed && commas.len() == 1 && parser.error_count() == err_start)
                .then(|| {
                    let comma = commas[0];
                    let between = TextRange::new(comma.end(), primary_range.start());
                    if parser
                        .slice(between)
                        .bytes()
                        .all(|byte| matches!(byte, b' ' | b'\t'))
                    {
                        TextRange::new(comma.start(), primary_range.start())
                    } else {
                        comma
                    }
                });

        parser.error(
            primary_range,
            SyntaxErrorKind::Array(ArrayErrorKind::LabeledArgumentLengthMismatch {
                first_entry,
                extra,
                split_comma,
                count,
            }),
        );
    }

    parser.start_node_at(checkpoint, SyntaxKind::LabeledArg);
    parser.finish_node();
}

fn parse_call_arg(parser: &mut Parser<'_, ExprGrammar>) {
    let Some(first) = parser.current() else {
        return;
    };

    // Shorthand labeled argument: `":label"`, excluding rooted paths starting with `"::"`.
    if let Some(decoded) = first.decode_string()
        && decoded.starts_with(':')
        && !decoded.starts_with("::")
    {
        parser.start_node(SyntaxKind::ShorthandLabeledArg);
        parser.bump(T![string]);
        parser.finish_node();
        return;
    }

    if first.kind == T!['{'] {
        let opened = OpenObject::open(parser);
        if let Some(second) = parser.current()
            && let Some(decoded) = second.decode_string()
            && decoded.starts_with(':')
        {
            parse_labeled_arg_after_open(parser, opened);
        } else {
            opened.parse_object(parser);
            parser.start_node_at(opened.checkpoint, SyntaxKind::PositionalArg);
            parser.finish_node();
        }
        return;
    }

    parser.start_node(SyntaxKind::PositionalArg);
    parse_expr(parser);
    parser.finish_node();
}

fn parse_call(parser: &mut Parser<'_, ExprGrammar>) {
    parser.start_node(SyntaxKind::CallExpr);
    let open = parser.bump(T!['[']).range;
    let err_start = parser.error_count();

    let mut count = 0_usize;
    while let ControlFlow::Continue(_) =
        recovery::next_array_element(parser, open, count, ExprGrammar::ITEM_FIRST)
    {
        if count == 0 {
            parse_expr(parser);
        } else {
            parse_call_arg(parser);
        }
        count += 1;
    }

    if count == 0 && parser.error_count() == err_start {
        let range = TextRange::new(open.start(), parser.last_token_end());
        parser.error(range, SyntaxErrorKind::Array(ArrayErrorKind::Empty));
    }

    parser.finish_node();
}

pub(crate) fn parse_expr(parser: &mut Parser<'_, ExprGrammar>) {
    let Some(token) = parser.current() else {
        parser.record_eof(ExprGrammar::ITEM_FIRST, EofContext::Document);
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

impl Grammar for ExprGrammar {
    type Root = cst::ExprRoot;

    const ALLOW_TYPE_ANNOTATIONS: bool = true;
    const ITEM_FIRST: SyntaxKindSet = SyntaxKindSet::from_slice(&[T![string], T!['['], T!['{']]);

    fn parse_item(parser: &mut Parser<'_, Self>) {
        parse_expr(parser);
    }
}
