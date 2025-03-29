use hashql_ast::node::{
    id::NodeId,
    r#type::{
        IntersectionType, StructField, StructType, TupleField, TupleType, Type, TypeKind, UnionType,
    },
};
use winnow::{
    ModalResult, Parser as _,
    combinator::{alt, delimited, dispatch, opt, peek, repeat, separated_pair, terminated},
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

    separated_boxed1(context.heap, parse_type_atom, ws("|"))
        .with_span()
        .map(|(types, span)| {
            let span = context.span(span);

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
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let context = input.state;

    separated_boxed1(context.heap, parse_type_union, ws("&"))
        .with_span()
        .map(|(types, span)| {
            let span = context.span(span);

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
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    ws(parse_type_intersection).parse_next(input)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::string::test::{bind_parser, test_cases};

    bind_parser!(fn parse_type_test(parse_type));
    bind_parser!(fn parse_type_infer_test(parse_type_infer));
    bind_parser!(fn parse_type_tuple_test(parse_type_tuple));
    bind_parser!(fn parse_type_struct_test(parse_type_struct));
    bind_parser!(fn parse_type_atom_test(parse_type_atom));
    bind_parser!(fn parse_type_union_test(parse_type_union));
    bind_parser!(fn parse_type_intersection_test(parse_type_intersection));

    // Tests for infer type "_"
    test_cases!(parse_type_infer_test;
        infer_type("_") => "Simple infer type",
        infer_with_whitespace(" _ ") => "Infer type with whitespace",
        infer_invalid("x") => "Invalid infer type",
    );

    // Tests for tuple types
    test_cases!(parse_type_tuple_test;
        empty_tuple("()") => "Empty tuple",
        single_element_tuple("(Int,)") => "Single-element tuple with trailing comma",
        two_element_tuple("(Int, String)") => "Two-element tuple",
        nested_tuple("((Int, String), Boolean)") => "Nested tuple type",
        tuple_with_whitespace("( Int , String )") => "Tuple with whitespace",
        tuple_with_extra_trailing_comma("(Int, String,)") => "Tuple with extra trailing comma",
        invalid_tuple("(Int, String") => "Invalid tuple (missing closing parenthesis)",
        invalid_empty("(,)") => "Invalid empty tuple with comma",
    );

    // Tests for struct types
    test_cases!(parse_type_struct_test;
        empty_struct("(:)") => "Empty struct",
        single_field_struct("(name: String)") => "Single-field struct",
        multi_field_struct("(name: String, age: Int)") => "Multi-field struct",
        struct_with_trailing_comma("(name: String, age: Int,)") => "Struct with trailing comma",
        struct_with_whitespace("( name : String , age : Int )") => "Struct with whitespace",
        nested_struct("(person: (name: String, age: Int))") => "Nested struct type",
        struct_with_complex_types("(data: (name: String, values: (Int, Boolean)))") => "Struct with complex field types",
        invalid_struct("(name: String, age: Int") => "Invalid struct (missing closing parenthesis)",
        invalid_field("(name String)") => "Invalid field (missing colon)",
        empty_field_name("(: String)") => "Empty field name",
    );

    // Tests for atom types (path, infer, tuples, structs)
    test_cases!(parse_type_atom_test;
        simple_path("Int") => "Simple path type",
        qualified_path("Std::String") => "Qualified path type",
        deeply_qualified_path("Std::Collections::HashMap") => "Deeply qualified path type",
        infer_atom("_") => "Infer atom type",
        tuple_atom("(Int, String)") => "Tuple atom type",
        struct_atom("(name: String, age: Int)") => "Struct atom type",
        paren_atom("(Int)") => "Parenthesized atom type",
        nested_paren("(((Int)))") => "Nested parenthesized atom type",
    );

    // Tests for union types
    test_cases!(parse_type_union_test;
        simple_union("Int | String") => "Simple union type",
        multi_union("Int | String | Boolean") => "Multiple union type",
        union_with_complex_types("(Int, String) | (name: String) | _") => "Union with complex types",
        union_with_whitespace("Int | String | Boolean") => "Union with whitespace",
        union_with_paths("Std::Int | Core::String") => "Union with paths",
        invalid_union("Int |") => "Invalid union (missing right side)",
    );

    // Tests for intersection types
    test_cases!(parse_type_intersection_test;
        simple_intersection("Int & String") => "Simple intersection type",
        multi_intersection("Int & String & Boolean") => "Multiple intersection type",
        intersection_with_complex_types("(Int, String) & (name: String) & _") => "Intersection with complex types",
        intersection_with_whitespace("Int & String & Boolean") => "Intersection with whitespace",
        intersection_with_paths("Std::Int & Core::String") => "Intersection with paths",
        invalid_intersection("Int &") => "Invalid intersection (missing right side)",
    );

    // Tests for combined types (full parse_type functionality)
    test_cases!(parse_type_test;
        // Simple types
        path_type("Std::String") => "Path type",
        infer_full("_") => "Infer type",
        tuple_full("(Int, String)") => "Tuple type",
        struct_full("(name: String, age: Int)") => "Struct type",

        // Union types
        union_full("Int | String") => "Union type",
        complex_union("Std::Int | (x: String, y: Boolean) | (Int, _)") => "Complex union type",

        // Intersection types
        intersection_full("Int & String") => "Intersection type",
        complex_intersection("Std::Int & (x: String, y: Boolean) & (Int, _)") => "Complex intersection type",

        // Combined types
        union_of_intersections("Int & String | Boolean & Char") => "Union of intersections",
        intersection_of_unions("Int | String & Boolean | Char") => "Intersection of unions",

        // Complex nested types
        complex_nested("((x: Int & String | Boolean) & (y: Char | _))") => "Complex nested type",
        parenthesized_union("(Int | String)") => "Parenthesized union type",
        parenthesized_intersection("(Int & String)") => "Parenthesized intersection type",

        // Edge cases
        single_element_tuple_full("(Int,)") => "Single-element tuple",
        empty_tuple_full("()") => "Empty tuple",
        empty_struct_full("(:)") => "Empty struct",
        multiple_layers("Int | String & Boolean | Char & Float") => "Multiple layers of operators",
        deeply_nested("(((Int | String) & (Boolean | Char)) | ((Float & Double) | (Short & Long)))") => "Deeply nested type expression",

        // Whitespace handling
        whitespace_heavy(" Int  |  String  &  Boolean ") => "Type with heavy whitespace",

        // Error cases
        unclosed_paren("(Int & String") => "Unclosed parenthesis",
        invalid_operator("Int $ String") => "Invalid operator",
        empty_union("Int | ") => "Empty union right side",
        empty_intersection("Int & ") => "Empty intersection right side",
        double_operator("Int || String") => "Double operator",
        missing_type("") => "Missing type",
    );

    // Additional tests for specific edge cases
    test_cases!(parse_type_test;
        // Complex type hierarchy tests
        union_precedence("Int & String | Boolean & Char") => "Testing union precedence (& binds tighter than |)",
        parenthesized_precedence("Int & (String | Boolean) & Char") => "Parenthesized precedence",

        // Nested complex structures
        nested_complex_struct("(outer: (inner: (value: Int, flag: Boolean), name: String))") => "Nested complex struct",
        mixed_nested_types("(data: Int | (name: String & (format: _ | Boolean)))") => "Mixed nested types with union, intersection, and infer",

        // Special case tests
        complex_with_paths("Std::Collections::HashMap | Core::Vec & (length: Int)") => "Complex with qualified paths",
        highly_complex("((a: Int | String) & (b: Boolean, c: Char) | (d: Float & Double))") => "Highly complex nested type with multiple operators",

        // Common type patterns
        optional_type("Option<String>") => "Option type",
        result_type("Result<Int, Error>") => "Result type",
        generic_container("Container<T>") => "Generic container type",
    );

    // Additional type-specific tests for HashQL idioms
    test_cases!(parse_type_test;
        // HashQL common types
        entity_type("Entity") => "Entity type",
        property_type("Entity.Property") => "Property access type",
        temporal_type("Temporal<Value>") => "Temporal type",
        reference_type("Ref<Entity>") => "Reference type",
        collection_type("Collection<Item>") => "Collection type",

        // Domain-specific types
        user_type("User") => "User entity type",
        composite_entity("(id: ID, name: String, metadata: (created: Timestamp, modified: Timestamp?))") => "Composite entity type",
        relationship_type("Relationship<User, Post>") => "Relationship type",
        maybe_type("Maybe<Value>") => "Maybe type (similar to Option)",
    );
}
