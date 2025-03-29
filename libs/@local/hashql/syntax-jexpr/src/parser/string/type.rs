use hashql_ast::node::{
    id::NodeId,
    r#type::{
        IntersectionType, StructField, StructType, TupleField, TupleType, Type, TypeKind, UnionType,
    },
};
use winnow::{
    ModalResult, Parser as _,
    combinator::{
        alt, delimited, dispatch, opt, peek, repeat, separated, separated_foldl1, separated_pair,
        terminated,
    },
    error::ParserError,
    token::any,
};

use super::{
    combinator::{separated_boxed1, ws},
    context::Input,
    ident::parse_ident,
};
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
    E: ParserError<Input<'heap, 'span, 'source>>,
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

fn parse_type_tuple<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let context = input.state;

    let empty = "()".with_span().map(|(_, span)| TupleType {
        id: NodeId::PLACEHOLDER,
        span: context.span(span),
        fields: context.heap.empty_slice(),
    });

    let fields = delimited(
        ws("("),
        (
            repeat(1.., terminated(parse_type_tuple_field, ws(","))),
            opt(parse_type_tuple_field),
        )
            .map(|(types, last): (Vec<_>, _)| {
                let required_length = types.len() + usize::from(last.is_some());

                let mut vec = context.heap.vec(Some(required_length));

                vec.extend(types);
                vec.extend(last);

                vec.into_boxed_slice()
            }),
        ws(")"),
    )
    .with_span()
    .map(|(fields, span)| TupleType {
        id: NodeId::PLACEHOLDER,
        span: context.span(span),
        fields,
    });

    alt((empty, fields))
        .map(|tuple| Type {
            id: NodeId::PLACEHOLDER,
            span: tuple.span,
            kind: TypeKind::Tuple(tuple),
        })
        .parse_next(input)
}

fn parse_type_struct_field<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<StructField<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let context = input.state;

    separated_pair(parse_ident, ws(":"), parse_type)
        .with_span()
        .map(|((name, r#type), span)| StructField {
            id: NodeId::PLACEHOLDER,
            span: context.span(span),
            name,
            r#type,
        })
        .parse_next(input)
}

fn parse_type_struct<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let context = input.state;

    let empty = "(:)".with_span().map(|(_, span)| StructType {
        id: NodeId::PLACEHOLDER,
        span: context.span(span),
        fields: context.heap.empty_slice(),
    });

    let fields = delimited(
        ws("("),
        terminated(
            separated_boxed1(context.heap, parse_type_struct_field, ws(",")),
            opt(ws(",")),
        ),
        ws(")"),
    )
    .with_span()
    .map(|(fields, span)| StructType {
        id: NodeId::PLACEHOLDER,
        span: context.span(span),
        fields,
    });

    alt((empty, fields))
        .map(|r#struct| Type {
            id: NodeId::PLACEHOLDER,
            span: r#struct.span,
            kind: TypeKind::Struct(r#struct),
        })
        .parse_next(input)
}

fn parse_type_paren<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    delimited(ws("("), parse_type, ws(")")).parse_next(input)
}

fn parse_type_atom<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let mut path = parse_path.map(|path| Type {
        id: NodeId::PLACEHOLDER,
        span: path.span,
        kind: TypeKind::Path(path),
    });

    dispatch! {peek(any);
        '_' => parse_type_infer,
        '(' => alt((parse_type_paren, parse_type_tuple, parse_type_struct)),
        _ => path
    }
    .parse_next(input)
}

fn parse_type_union<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
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
                    types: types.into_boxed_slice(),
                }),
            }
        })
        .parse_next(input)
}

fn parse_type_intersection<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
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
                    types: types.into_boxed_slice(),
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
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    ws(parse_type_intersection).parse_next(input)
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
