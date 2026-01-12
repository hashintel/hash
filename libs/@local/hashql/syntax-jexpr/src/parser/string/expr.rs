use core::num::ParseIntError;

use hashql_ast::node::{
    expr::{Expr, ExprKind, FieldExpr, IndexExpr, LiteralExpr},
    id::NodeId,
};
use hashql_core::{
    symbol::{Ident, IdentKind},
    value::{self, Primitive},
};
use winnow::{
    ModalResult, Parser as _,
    ascii::{digit1, multispace0},
    combinator::{alt, cut_err, dispatch, eof, fail, peek, preceded, repeat, terminated},
    error::{AddContext, FromExternalError, ParserError, StrContext, StrContextValue},
    token::any,
};

use super::{
    combinator::{Alt2, ws},
    context::Input,
    ident::parse_ident,
    path::parse_path,
};

#[derive(Debug)]
enum Access<'heap> {
    IndexByLiteral(LiteralExpr<'heap>),
    IndexByExpr(Expr<'heap>),
    Field(Ident<'heap>),
}

// super limited set of expressions that are supported in strings for convenience
fn parse_field_access<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Access<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + FromExternalError<Input<'heap, 'span, 'source>, ParseIntError>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    let _: &'source str = ws(".").parse_next(input)?;

    match peek(any).parse_next(input)? {
        '0'..='9' => {
            let (digit, range) = digit1
                .with_span()
                .try_map(|(digits, range): (&str, _)| {
                    // Ensure the value is within bounds
                    digits.parse::<usize>().map(|_| (digits, range))
                })
                .parse_next(input)?;

            Ok(Access::Field(Ident {
                span: input.state.span(range),

                value: input.state.heap.intern_symbol(digit),
                kind: IdentKind::Lexical, // Do we need to specify a different kind here?
            }))
        }

        _ => parse_ident.map(Access::Field).parse_next(input),
    }
}

fn parse_index_access<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Access<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + FromExternalError<Input<'heap, 'span, 'source>, ParseIntError>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    let _: &'source str = ws("[").parse_next(input)?;

    // super limited version that only allows literal access instead of arbitrary expressions
    let access = match peek(any).parse_next(input)? {
        '0'..='9' => {
            let (digit, range) = digit1.with_span().parse_next(input)?;

            Access::IndexByLiteral(LiteralExpr {
                id: NodeId::PLACEHOLDER,
                span: input.state.span(range),
                kind: Primitive::Integer(value::Integer::new_unchecked(
                    input.state.heap.intern_symbol(digit),
                )),
                r#type: None,
            })
        }
        _ => parse_expr_path.map(Access::IndexByExpr).parse_next(input)?,
    };

    let _: &'source str =
        ws(cut_err("]").context(StrContext::Expected(StrContextValue::CharLiteral(']'))))
            .parse_next(input)?;

    Ok(access)
}

pub(crate) fn parse_expr_path<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Expr<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + FromExternalError<Input<'heap, 'span, 'source>, ParseIntError>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    let ((path, path_span), access): (_, Vec<_>) = (
        parse_path.with_span(),
        repeat(
            0..,
            preceded(
                multispace0,
                dispatch! {peek(any);
                    '[' => parse_index_access.context(StrContext::Label("index")),
                    '.' => parse_field_access.context(StrContext::Label("field")),
                    _ => fail
                        .context(StrContext::Expected(StrContextValue::CharLiteral('[')))
                        .context(StrContext::Expected(StrContextValue::CharLiteral('.')))
                }
                .with_span(),
            ),
        ),
    )
        .parse_next(input)?;

    let mut range = path_span;

    let mut expr = Expr {
        id: NodeId::PLACEHOLDER,
        span: path.span,
        kind: ExprKind::Path(path),
    };

    for (access, span) in access {
        range.end = span.end;

        let span = input.state.span(range.clone());

        // We de-sugar into expressions directly instead of special forms, not to save
        // on memory, but just because it is a lot easier and terse to create these
        // nodes instead of fully-fledged call nodes.
        let kind = match access {
            Access::IndexByLiteral(literal) => ExprKind::Index(IndexExpr {
                id: NodeId::PLACEHOLDER,
                span,
                value: Box::new_in(expr, input.state.heap),
                index: Box::new_in(
                    Expr {
                        id: NodeId::PLACEHOLDER,
                        span: literal.span,
                        kind: ExprKind::Literal(literal),
                    },
                    input.state.heap,
                ),
            }),
            Access::IndexByExpr(index) => ExprKind::Index(IndexExpr {
                id: NodeId::PLACEHOLDER,
                span,
                value: Box::new_in(expr, input.state.heap),
                index: Box::new_in(index, input.state.heap),
            }),
            Access::Field(ident) => ExprKind::Field(FieldExpr {
                id: NodeId::PLACEHOLDER,
                span,
                value: Box::new_in(expr, input.state.heap),
                field: ident,
            }),
        };

        expr = Expr {
            id: NodeId::PLACEHOLDER,
            span,
            kind,
        };
    }

    Ok(expr)
}

// super limited set of expressions that are supported in strings for convenience
pub(crate) fn parse_expr<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Expr<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + FromExternalError<Input<'heap, 'span, 'source>, ParseIntError>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    let alt = alt((
        terminated('_', ws(eof)).span().map(Alt2::Left),
        parse_expr_path.map(Alt2::Right),
    ))
    .context(StrContext::Label("expression"))
    .parse_next(input)?;

    match alt {
        Alt2::Left(span) => Ok(Expr {
            id: NodeId::PLACEHOLDER,
            span: input.state.span(span),
            kind: ExprKind::Underscore,
        }),
        Alt2::Right(right) => Ok(right),
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_expr, parse_field_access, parse_index_access};
    use crate::parser::string::test::{bind_parser, test_cases};

    // Bind our parsers to create testing functions
    bind_parser!(SyntaxDump; fn parse_expr_test(parse_expr));
    bind_parser!(Debug; fn parse_field_access_test(parse_field_access));
    bind_parser!(Debug; fn parse_index_access_test(parse_index_access));

    // Tests for field access
    test_cases!(parse_field_access_test;
        simple_field(".field") => "Simple field access",
        numeric_field(".123") => "Numeric field name",
        whitespace_before(".  field") => "Field access with whitespace before name",

        // Error cases
        missing_field_name(".") => "Missing field name",
        invalid_field_name(".@field") => "Invalid field name",
        index_too_large(".18446744073709551616") => "Index too large",
    );

    // Tests for index access
    test_cases!(parse_index_access_test;
        simple_index("[0]") => "Simple index access",
        multi_digit_index("[123]") => "Multi-digit index",
        whitespace_in_brackets("[ 42 ]") => "Whitespace inside brackets",

        // Error cases
        empty_brackets("[]") => "Empty brackets",
        unclosed_bracket("[42") => "Unclosed bracket",
        non_numeric_index("[abc]") => "Non-numeric index",
    );

    // Tests for full expressions
    test_cases!(parse_expr_test;
        // Simple paths
        simple_identifier("foo") => "Simple identifier",
        qualified_path("std::collections::HashMap") => "Qualified path",

        // Field access
        single_field_access("foo.bar") => "Single field access",
        chained_field_access("foo.bar.baz") => "Chained field access",
        numeric_field_access("foo.123") => "Numeric field access",

        // Index access
        single_index_access("foo[0]") => "Single index access",
        chained_index_access("foo[0][1]") => "Chained index access",

        // Index access with identifier
        index_access_with_ident("foo[bar]") => "Index access with identifier",
        index_access_with_ident_chained("foo[bar][baz]") => "Chained index access with identifier",

        // Index access mixed
        index_access_mixed("foo[bar][0]") => "Mixed index access",
        index_access_field_access("foo[bar.0]") => "Field then index access",

        // Mixed access
        mixed_access_1("foo.bar[0]") => "Field then index access",
        mixed_access_2("foo[0].bar") => "Index then field access",
        complex_access("foo.bar[0].baz[42].qux") => "Complex mixed access chain",

        // Path with generics
        generic_path("Vec<Int>") => "Path with generic",
        generic_with_access("Vec<Int>[0]") => "Generic path with index access",
        generic_with_field("Result<T, E>.value") => "Generic path with field access",

        // Whitespace handling
        whitespace_between_access("foo . bar [ 0 ]") => "Whitespace between access operations",
        whitespace_in_path("std :: collections :: HashMap") => "Whitespace in path",

        // Rooted paths
        rooted_path("::foo") => "Rooted path",
        rooted_with_access("::foo.bar[0]") => "Rooted path with access",

        // Underscore paths
        underscore("_") => "Underscore path",
        underscore_identifier("_name") => "Underscore identifier",
    );

    // Error cases for full expressions
    test_cases!(parse_expr_test;
        invalid_start(".foo") => "Starting with field access",
        invalid_start_2("[0]") => "Starting with index access",
        empty_expression("") => "Empty expression",
        unclosed_access_chain("foo.bar[0") => "Unclosed access chain",
        invalid_character("foo$bar") => "Invalid character in expression",
    );
}
