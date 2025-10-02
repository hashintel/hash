use core::ops::Range;

use hashql_ast::node::{
    id::NodeId,
    r#type::{
        IntersectionType, StructField, StructType, TupleField, TupleType, Type, TypeKind, UnionType,
    },
};
use hashql_core::symbol::Ident;
use winnow::{
    ModalParser, ModalResult, Parser as _,
    ascii::multispace0,
    combinator::{
        alt, cut_err, dispatch, fail, opt, peek, preceded, repeat, separated, separated_pair,
        terminated,
    },
    error::{AddContext, ParserError, StrContext, StrContextValue},
    token::any,
};

use super::{combinator::ws, context::Input, ident::parse_ident};
use crate::parser::string::path::parse_path;

fn parse_type_infer<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let context = input.state;

    "_".with_span()
        .map(|(_, span)| Type {
            id: NodeId::PLACEHOLDER,
            span: context.span(span),
            kind: TypeKind::Infer,
        })
        .parse_next(input)
}

fn parse_type_tuple_field<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<TupleField<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    let context = input.state;

    parse_type
        .with_span()
        .map(|(r#type, span)| TupleField {
            id: NodeId::PLACEHOLDER,
            span: context.span(span),
            r#type,
        })
        .parse_next(input)
}

fn parse_type_struct_field<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<StructField<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    let context = input.state;

    separated_pair(
        parse_ident,
        ws(cut_err(":").context(StrContext::Expected(StrContextValue::CharLiteral(':')))),
        parse_type,
    )
    .with_span()
    .map(|((name, r#type), span)| StructField {
        id: NodeId::PLACEHOLDER,
        span: context.span(span),
        name,
        r#type,
    })
    .parse_next(input)
}

fn parse_type_paren_empty_tuple<'heap, 'span, 'source, E>(
    start_span: Range<usize>,
) -> impl ModalParser<Input<'heap, 'span, 'source>, Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    move |input: &mut Input<'heap, 'span, 'source>| {
        let context = input.state;

        cut_err(')')
            .span()
            .map(|span| {
                let span = context.span(Range {
                    start: start_span.start,
                    end: span.end,
                });

                Type {
                    id: NodeId::PLACEHOLDER,
                    span,
                    kind: TypeKind::Tuple(TupleType {
                        id: NodeId::PLACEHOLDER,
                        span,
                        fields: context.heap.vec(None),
                    }),
                }
            })
            .context(StrContext::Expected(StrContextValue::CharLiteral(')')))
            .parse_next(input)
    }
}

fn parse_type_paren_empty_struct<'heap, 'span, 'source, E>(
    start_span: Range<usize>,
) -> impl ModalParser<Input<'heap, 'span, 'source>, Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    move |input: &mut Input<'heap, 'span, 'source>| {
        let context = input.state;

        cut_err(":)")
            .span()
            .map(|span| {
                let span = context.span(Range {
                    start: start_span.start,
                    end: span.end,
                });

                Type {
                    id: NodeId::PLACEHOLDER,
                    span,
                    kind: TypeKind::Struct(StructType {
                        id: NodeId::PLACEHOLDER,
                        span,
                        fields: context.heap.vec(None),
                    }),
                }
            })
            .context(StrContext::Expected(StrContextValue::StringLiteral(":)")))
            .parse_next(input)
    }
}

fn parse_type_paren_struct<'heap, 'span, 'source, E>(
    ident: Ident<'heap>,
    partial_field_span: Range<usize>,

    start_span: Range<usize>,
) -> impl ModalParser<Input<'heap, 'span, 'source>, Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    move |input: &mut Input<'heap, 'span, 'source>| {
        let context = input.state;

        // to now construct the first field, we just need to parse the type
        let (field_type, field_range) = parse_type.with_span().parse_next(input)?;

        let field_span = context.span(Range {
            start: partial_field_span.start,
            end: field_range.end,
        });

        let mut field = Some(StructField {
            id: NodeId::PLACEHOLDER,
            span: field_span,
            name: ident,
            r#type: field_type,
        });

        let fields = terminated(
            repeat(0.., preceded(ws(","), parse_type_struct_field)),
            opt(","),
        );

        terminated(
            fields,
            ws(cut_err(')').context(StrContext::Expected(StrContextValue::CharLiteral(')')))),
        )
        .with_span()
        .map(move |(mut fields, mut span): (Vec<_>, _)| {
            let field = field.take().expect("Parser called more than once");

            span.start = start_span.start;
            let span = context.span(span);

            fields.insert(0, field);

            Type {
                id: NodeId::PLACEHOLDER,
                span,
                kind: TypeKind::Struct(StructType {
                    id: NodeId::PLACEHOLDER,
                    span,
                    fields: context.heap.transfer_vec(fields),
                }),
            }
        })
        .parse_next(input)
    }
}

fn parse_type_paren_tuple<'heap, 'span, 'source, E>(
    first: Type<'heap>,

    start_span: Range<usize>,
) -> impl ModalParser<Input<'heap, 'span, 'source>, Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    let mut first = Some(first);

    move |input: &mut Input<'heap, 'span, 'source>| {
        let context = input.state;

        terminated(
            (
                cut_err(','),
                repeat(0.., terminated(parse_type_tuple_field, ws(","))),
                opt(parse_type_tuple_field),
            ),
            ws(cut_err(')').context(StrContext::Expected(StrContextValue::CharLiteral(')')))),
        )
        .with_span()
        .map(|((_, rest, last), mut span): ((_, Vec<_>, _), _)| {
            let first = first.take().expect("Parser called more than once");

            let first = TupleField {
                id: NodeId::PLACEHOLDER,
                span: first.span,
                r#type: first,
            };

            span.start = start_span.start;
            let span = context.span(span);

            let mut fields = Vec::with_capacity(rest.len() + 2);
            fields.push(first);
            fields.extend(rest);
            if let Some(last) = last {
                fields.push(last);
            }

            Type {
                id: NodeId::PLACEHOLDER,
                span,
                kind: TypeKind::Tuple(TupleType {
                    id: NodeId::PLACEHOLDER,
                    span,
                    fields: context.heap.transfer_vec(fields),
                }),
            }
        })
        .parse_next(input)
    }
}

fn parse_type_paren<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    enum ParseDecision<'heap> {
        Struct(Ident<'heap>, Range<usize>),
        TupleOrParen(Type<'heap>),
    }

    let context = input.state;

    let start_span = ws("(").span().parse_next(input)?;

    // when we're inside parenthesis we can be one of the following:
    // - a group
    // - a tuple
    // - a struct

    // take a look at the next token, to determine if what we're parsing an empty variant, in that
    // case we can return it
    match peek(any).parse_next(input)? {
        // empty struct
        ':' => return parse_type_paren_empty_struct(start_span).parse_next(input),
        // empty tuple
        ')' => return parse_type_paren_empty_tuple(start_span).parse_next(input),
        _ => {}
    }

    // Now that the empty variants are out of the way, we need to determine, are we in a struct,
    // tuple or paren?
    let decision = alt((
        terminated(parse_ident, ws(":"))
            .with_span()
            .map(|(ident, span)| ParseDecision::Struct(ident, span)),
        parse_type.map(ParseDecision::TupleOrParen),
    ))
    .parse_next(input)?;

    // given our parse decision we now know if we're in a struct, or not, in case we are, fall back
    // to the struct parser
    match decision {
        ParseDecision::Struct(ident, partial_field_span) => {
            parse_type_paren_struct(ident, partial_field_span, start_span).parse_next(input)
        }
        ParseDecision::TupleOrParen(r#type) => {
            // To finally figure out if we're in a paren or tuple, check the next character, if it's
            // a `)` we're in a paren, otherwise in a tuple

            let _: &str = multispace0.parse_next(input)?;

            match peek(opt(any)).parse_next(input)? {
                Some(')') => {
                    let mut r#type = Some(r#type);
                    cut_err(")")
                        .span()
                        .map(|mut span| {
                            let r#type = r#type.take().expect("Parser called more than once");

                            // Extend the span of the type to include the closing parenthesis
                            span.start = start_span.start;
                            context.cover(r#type.span, span);

                            r#type
                        })
                        .context(StrContext::Expected(StrContextValue::CharLiteral(')')))
                        .parse_next(input)
                }
                Some(',') => parse_type_paren_tuple(r#type, start_span).parse_next(input),
                _ => fail
                    .context(StrContext::Expected(StrContextValue::CharLiteral(')')))
                    .context(StrContext::Expected(StrContextValue::CharLiteral(',')))
                    .context(StrContext::Expected(StrContextValue::CharLiteral(':')))
                    .parse_next(input),
            }
        }
    }
}

fn parse_type_atom<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    let mut path = parse_path.map(|path| Type {
        id: NodeId::PLACEHOLDER,
        span: path.span,
        kind: TypeKind::Path(path),
    });

    dispatch! {peek(any);
        '_' => parse_type_infer,
        '(' => parse_type_paren,
        _ => path
    }
    .parse_next(input)
}

fn parse_type_union<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    let context = input.state;

    separated(1.., parse_type_atom, ws("|"))
        .with_span()
        .map(|(mut parsed, span): (Vec<_>, _)| {
            if parsed.len() == 1 {
                return parsed.pop().unwrap_or_else(|| unreachable!());
            }

            let span = context.span(span);

            let mut types = context.heap.vec(Some(parsed.len()));
            types.extend(parsed);

            Type {
                id: NodeId::PLACEHOLDER,
                span,
                kind: TypeKind::Union(UnionType {
                    id: NodeId::PLACEHOLDER,
                    span,
                    types,
                }),
            }
        })
        .parse_next(input)
}

fn parse_type_intersection<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    let context = input.state;

    separated(1.., parse_type_union, ws("&"))
        .with_span()
        .map(|(mut parsed, span): (Vec<_>, _)| {
            if parsed.len() == 1 {
                return parsed.pop().unwrap_or_else(|| unreachable!());
            }

            let span = context.span(span);

            let mut types = context.heap.vec(Some(parsed.len()));
            types.extend(parsed);

            Type {
                id: NodeId::PLACEHOLDER,
                span,
                kind: TypeKind::Intersection(IntersectionType {
                    id: NodeId::PLACEHOLDER,
                    span,
                    types,
                }),
            }
        })
        .parse_next(input)
}

/// ```abnf
/// infer = "_"
/// tuple = "()" / "(" +(type ",") ?(type) ")"
/// struct = "(:)" / "(" ident ":" type *("," ident ":" type) ?"," ")"
/// paren = "(" type ")"
/// atom = path / tuple / struct / infer / paren
/// union = atom *("|" atom)
/// intersection = union *("&" union)
/// type = intersection
/// ```
pub(crate) fn parse_type<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    ws(parse_type_intersection)
        .context(StrContext::Label("type"))
        .parse_next(input)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::string::test::{bind_parser, test_cases};

    bind_parser!(SyntaxDump; fn parse_type_test(parse_type));

    // Tests for individual parser components
    test_cases!(parse_type_test;
        // Atom types
        infer_type("_") => "Infer type",
        simple_path("Int") => "Simple path type",
        qualified_path("Std::String") => "Qualified path",
        nested_qualified_path("Std::Collections::HashMap") => "Nested qualified path",

        // Tuple types
        empty_tuple("()") => "Empty tuple",
        single_element_tuple("(Int,)") => "Single-element tuple with trailing comma",
        multi_element_tuple("(Int, String, Boolean)") => "Multi-element tuple",
        infer_tuple("(_, _, _)") => "Inferred tuple type",

        // Struct types
        empty_struct("(:)") => "Empty struct",
        single_field_struct("(name: String)") => "Single-field struct",
        multi_field_struct("(name: String, age: Int)") => "Multi-field struct",

        // Union types
        simple_union("Int | String") => "Simple union type",
        multi_union("Int | String | Boolean") => "Multiple union type",

        // Intersection types
        simple_intersection("Int & String") => "Simple intersection type",
        multi_intersection("Int & String & Boolean") => "Multiple intersection type",
    );

    // Tests for composite structures and nesting
    test_cases!(parse_type_test;
        // Nested structures
        nested_tuple("((Int, String), Boolean)") => "Nested tuple type",
        nested_struct("(person: (name: String, age: Int))") => "Nested struct type",
        struct_with_tuple_field("(data: (Int, String))") => "Struct with tuple field",
        tuple_with_struct_field("((name: String), Int)") => "Tuple with struct field",

        // Whitespace handling
        tuple_with_whitespace("( Int , String )") => "Tuple with whitespace",
        struct_with_whitespace("( name : String , age : Int )") => "Struct with whitespace",
        union_with_whitespace(" Int | String ") => "Union with whitespace",
        intersection_with_whitespace(" Int & String ") => "Intersection with whitespace",
    );

    // Tests for operator precedence and complex expressions
    test_cases!(parse_type_test;
        union_of_atoms("Int | String | Boolean") => "Union of atom types",
        intersection_of_atoms("Int & String & Boolean") => "Intersection of atom types",
        union_of_intersections("Int & String | Boolean & Char") => "Union of intersections",
        intersection_of_unions("Int | String & Boolean | Char") => "Intersection of unions",
        mixed_precedence("Int & (String | Boolean) & Char") => "Mixed precedence with parentheses",
        deeply_nested("(((Int | String) & Boolean) | Char)") => "Deeply nested expression",
    );

    // Error cases
    test_cases!(parse_type_test;
        unclosed_tuple("(Int, String") => "Unclosed tuple",
        unclosed_struct("(name: String, age: Int") => "Unclosed struct",
        missing_field_type("(name: )") => "Missing field type",
        missing_colon("(name: String, age Int)") => "Missing field type",
        invalid_field_separator("(name String)") => "Invalid field separator",
        unclosed_parenthesized("(Int & String") => "Unclosed parenthesized type",
        incomplete_union("Int |") => "Incomplete union",
        incomplete_intersection("Int &") => "Incomplete intersection",
        invalid_operator("Int $ String") => "Invalid operator",
        double_operator("Int || String") => "Double union operator",
        missing_type("") => "Missing type",
    );

    // Tests for common real-world type patterns
    test_cases!(parse_type_test;
        generic_path("Container<T>") => "Generic type",
        generic_with_multiple_params("Map<Key, Value>") => "Generic with multiple parameters",
        nested_generics("Container<Wrapper<T>>") => "Nested generic types",
        optional_type("Option<Value>") => "Optional type pattern",
        complex_entity("(id: ID, attrs: (name: String, metadata: (created: Timestamp, modified: Timestamp | Null)))") => "Complex entity type with nested fields",
    );
}
