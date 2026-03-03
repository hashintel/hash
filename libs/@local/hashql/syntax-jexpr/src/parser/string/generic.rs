use hashql_ast::node::{
    generic::{GenericArgument, GenericConstraint, GenericParam, Generics},
    id::NodeId,
};
use winnow::{
    ModalResult, Parser as _,
    combinator::{cut_err, delimited, opt, preceded},
    error::{AddContext, ParserError, StrContext, StrContextValue},
};

use super::{
    combinator::{separated_alloc1, ws},
    context::Input,
    ident::parse_ident,
    r#type::parse_type,
};

pub(crate) fn parse_generic_argument<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<GenericArgument<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    let (r#type, span) = parse_type
        .with_span()
        .context(StrContext::Label("generic argument"))
        .parse_next(input)?;

    Ok(GenericArgument {
        id: NodeId::PLACEHOLDER,
        span: input.state.span(span),
        r#type: Box::new_in(r#type, input.state.heap),
    })
}

pub(crate) fn parse_generic_constraint<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<GenericConstraint<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    let ((name, bound), span) = (parse_ident, preceded(ws(":"), parse_type))
        .with_span()
        .context(StrContext::Label("generic constraint"))
        .parse_next(input)?;

    Ok(GenericConstraint {
        id: NodeId::PLACEHOLDER,
        span: input.state.span(span),
        name,
        bound: Some(Box::new_in(bound, input.state.heap)),
    })
}

fn parse_generic_param<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<GenericParam<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    let ((name, bound), span) = (parse_ident, opt(preceded(ws(":"), parse_type)))
        .with_span()
        .context(StrContext::Label("generic parameter"))
        .parse_next(input)?;

    Ok(GenericParam {
        id: NodeId::PLACEHOLDER,
        span: input.state.span(span),
        name,
        bound: bound.map(|bound| Box::new_in(bound, input.state.heap)),
    })
}

#[expect(clippy::allow_attributes, reason = "except doesn't work here")]
#[allow(
    dead_code,
    reason = "This function will be used in the future for parsing closure signatures"
)]
pub(crate) fn parse_generics<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Generics<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    let (params, span) = delimited(
        ws("<"),
        separated_alloc1(input.state.heap, parse_generic_param, ws(",")),
        ws(cut_err(">").context(StrContext::Expected(StrContextValue::CharLiteral('>')))),
    )
    .with_span()
    .context(StrContext::Label("generics"))
    .parse_next(input)?;

    Ok(Generics {
        id: NodeId::PLACEHOLDER,
        span: input.state.span(span),
        params,
    })
}

#[cfg(test)]
mod tests {
    use super::{parse_generic_argument, parse_generic_constraint, parse_generics};
    use crate::parser::string::test::{bind_parser, test_cases};

    // Bind our parsers to create testing functions
    bind_parser!(SyntaxDump; fn parse_generic_argument_test(parse_generic_argument));
    bind_parser!(SyntaxDump; fn parse_generic_constraint_test(parse_generic_constraint));
    bind_parser!(SyntaxDump; fn parse_generics_test(parse_generics));

    // Tests for generic arguments
    test_cases!(parse_generic_argument_test;
        simple_type("Int") => "Simple type as generic argument",
        complex_type("Map<K, V>") => "Generic type as generic argument",
        nested_type("Option<Result<T, E>>") => "Nested generic types",
        union_type("Int | String") => "Union type as generic argument",
        intersection_type("Serializable & Equatable") => "Intersection type as generic argument",
        tuple_type("(Int, String)") => "Tuple type as generic argument",
        struct_type("(key: K, value: V)") => "Struct type as generic argument",
        infer_type("_") => "Infer type as generic argument",
        whitespace_handling_argument(" Int ") => "Generic argument with whitespace",
    );

    // Tests for generic constraints
    test_cases!(parse_generic_constraint_test;
        // Simple identifier constraints
        constraint_simple_ident("T") => "Simple identifier without bound",
        constraint_snake_case_ident("snake_case") => "Snake case identifier",
        constraint_camel_case_ident("CamelCase") => "Camel case identifier",

        // With type bounds
        constraint_simple_bound("T: Int") => "Simple type bound",
        constraint_generic_bound("K: Map<T, V>") => "Generic type as bound",
        constraint_nested_bound("T: Option<Result<U, E>>") => "Nested generic types as bound",
        constraint_union_bound("T: A | B") => "Union type as bound",
        constraint_intersection_bound("T: Serializable & Comparable") => "Intersection type as bound",
        constraint_tuple_bound("T: (Int, String)") => "Tuple type as bound",
        constraint_struct_bound("T: (key: K, value: V)") => "Struct type as bound",
        constraint_infer_bound("T: _") => "Infer type as bound",

        // Whitespace variations
        constraint_whitespace_in_bound("T : Int") => "Whitespace around colon",
        constraint_extra_whitespace("T  :  Int ") => "Extra whitespace throughout",

        // These would be error cases in a full parse, but this function only parses a single constraint
        constraint_no_bound_specified("T:") => "No bound specified after colon",
        constraint_invalid_ident("123") => "Invalid identifier",
        constraint_invalid_bound_syntax("T Int") => "Missing colon between ident and bound",
    );

    // Tests for generics (lists of generic parameters)
    test_cases!(parse_generics_test;
        single_param("<T>") => "Single generic parameter without bound",
        multiple_params("<T, U, V>") => "Multiple generic parameters",

        // With type bounds
        param_with_bound("<T: Object>") => "Generic parameter with type bound",
        mixed_bounds("<T, U: Comparable, V>") => "Mix of bounded and unbounded parameters",
        complex_bound("<K: Map<T, V>>") => "Complex type bound",
        union_bound("<T: A | B>") => "Union type as bound",
        intersection_bound("<T: Serializable & Comparable>") => "Intersection type as bound",

        // Whitespace variations
        whitespace_handling("< T , U >") => "Generics with whitespace",
        bound_whitespace("< T : Comparable >") => "Bound with whitespace",

        // Error cases
        unclosed_generics("<T, U") => "Unclosed generics",
        empty_generics("<>") => "Empty generics",
        missing_comma("<T U>") => "Missing comma between parameters",
        invalid_bound("<T: >") => "Invalid bound specification",
        invalid_parameter("<123>") => "Invalid parameter name",
    );
}
