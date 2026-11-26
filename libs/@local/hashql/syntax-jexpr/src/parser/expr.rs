use core::{alloc::Allocator, ops::ControlFlow};

use text_size::TextRange;

use super::{
    Grammar, Parser, PeekToken,
    object::{self, OpenObject},
    recovery::{self, ObjectEntry},
};
use crate::{
    cst,
    error::{ArrayErrorKind, EofContext, SyntaxErrorKind},
    syntax_kind::{SyntaxKind, T},
    syntax_kind_set::SyntaxKindSet,
};

pub(crate) struct ExprGrammar;

impl Grammar for ExprGrammar {
    type Root = cst::ExprRoot;

    const ALLOW_TYPE_ANNOTATIONS: bool = true;
    const ITEM_FIRST: SyntaxKindSet = SyntaxKindSet::from_slice(&[T![string], T!['['], T!['{']]);

    fn parse_item<A>(parser: &mut Parser<'_, Self, A>)
    where
        A: Allocator + Clone,
    {
        parse_expr(parser);
    }
}

fn parse_labeled_arg_after_open<A>(
    parser: &mut Parser<'_, ExprGrammar, A>,
    OpenObject {
        checkpoint,
        open,
        error_start,
    }: OpenObject,
) where
    A: Allocator + Clone,
{
    let mut entry_ranges = Vec::new_in(parser.allocator().clone());
    let mut commas = Vec::new_in(parser.allocator().clone());
    let mut all_prefixed = true;
    let mut index = 0_usize;

    while let ControlFlow::Continue(ObjectEntry { separator, mut key }) =
        recovery::next_object_entry(parser, open, index)
    {
        if let Some(comma) = separator {
            commas.push(comma);
        }
        index += 1;
        key.start_node(SyntaxKind::LabeledArgEntry);
        let key_range = key.range();
        let decoded = key.decode_string();
        let parser = key.commit();

        if let Some(decoded) = decoded {
            if !decoded.starts_with(':') {
                all_prefixed = false;
                parser.error(
                    key_range,
                    SyntaxErrorKind::Array(ArrayErrorKind::LabeledArgumentMissingPrefix {
                        actual: decoded.into_owned(),
                    }),
                );
            }
        } else {
            all_prefixed = false;
        }

        recovery::parse_object_field_value(parser, key_range, parse_expr);

        let entry_range = TextRange::new(key_range.start(), parser.last_token_end());
        entry_ranges.push(entry_range);
        parser.finish_node();
    }

    if entry_ranges.len() != 1 {
        let count = entry_ranges.len();
        let (primary_range, first_entry) = if count >= 2 {
            let first = entry_ranges.remove(0);
            let second = entry_ranges.remove(0);
            (second, Some(first))
        } else {
            let object_range = TextRange::new(open.start(), parser.last_token_end());
            (object_range, None)
        };

        let split_comma = (count == 2
            && all_prefixed
            && commas.len() == 1
            && parser.error_count() == error_start)
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
                extra: entry_ranges,
                split_comma,
                count,
            }),
        );
    }

    parser.start_node_at(checkpoint, SyntaxKind::LabeledArg);
    parser.finish_node();
}

fn parse_call_arg<A>(parser: &mut Parser<'_, ExprGrammar, A>)
where
    A: Allocator + Clone,
{
    let Some(first) = parser.peek() else {
        return;
    };

    // Shorthand labeled argument: `":label"`, excluding rooted paths starting with `"::"`.
    if let Some(decoded) = first.decode_string()
        && decoded.starts_with(':')
        && !decoded.starts_with("::")
    {
        first.commit_node(SyntaxKind::ShorthandLabeledArg);
        return;
    }

    if first.kind() == T!['{'] {
        let (opened, parser) = OpenObject::open(first);
        if let Some(second) = parser.peek()
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

fn parse_call<A>(mut open: PeekToken<'_, '_, ExprGrammar, A>)
where
    A: Allocator + Clone,
{
    open.start_node(SyntaxKind::CallExpr);
    let open_range = open.range();
    let parser = open.commit();
    let error_start = parser.error_count();

    let mut count = 0_usize;
    while recovery::next_array_element(parser, open_range, count, ExprGrammar::ITEM_FIRST)
        .is_continue()
    {
        if count == 0 {
            parser.nested(parse_expr);
        } else {
            parser.nested(parse_call_arg);
        }

        count += 1;
    }

    if count == 0 && parser.error_count() == error_start {
        let range = TextRange::new(open_range.start(), parser.last_token_end());
        parser.error(range, SyntaxErrorKind::Array(ArrayErrorKind::Empty));
    }

    parser.finish_node();
}

pub(crate) fn parse_expr<A>(parser: &mut Parser<'_, ExprGrammar, A>)
where
    A: Allocator + Clone,
{
    let Some(token) = parser.peek() else {
        parser.record_eof(ExprGrammar::ITEM_FIRST, EofContext::Document);
        return;
    };

    let kind = token.kind();
    if kind == T![string] {
        token.commit_node(SyntaxKind::PathExpr);
    } else if kind == T!['['] {
        parse_call(token);
    } else if kind == T!['{'] {
        object::parse_object(token);
    } else {
        recovery::recover_unexpected_item(parser);
    }
}
