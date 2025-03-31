use hashql_ast::node::{
    generic::{GenericArgument, GenericParam, Generics},
    id::NodeId,
};
use winnow::{
    ModalResult, Parser as _,
    combinator::{cut_err, delimited, opt, preceded},
    error::{AddContext, ParserError, StrContext, StrContextValue},
};

use super::{
    combinator::{separated_boxed1, ws},
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
    let context = input.state;

    parse_type
        .with_span()
        .map(|(r#type, span)| GenericArgument {
            id: NodeId::PLACEHOLDER,
            span: context.span(span),
            r#type: context.heap.boxed(r#type),
        })
        .context(StrContext::Label("generic argument"))
        .parse_next(input)
}

fn parse_generic_param<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<GenericParam<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    let context = input.state;

    (parse_ident, opt(preceded(ws(":"), parse_type)))
        .with_span()
        .map(|((name, bound), span)| GenericParam {
            id: NodeId::PLACEHOLDER,
            span: context.span(span),
            name,
            bound: bound.map(|bound| context.heap.boxed(bound)),
        })
        .context(StrContext::Label("generic parameter"))
        .parse_next(input)
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
    let context = input.state;

    delimited(
        ws("<"),
        separated_boxed1(context.heap, parse_generic_param, ws(",")),
        ws(cut_err(">").context(StrContext::Expected(StrContextValue::CharLiteral('>')))),
    )
    .with_span()
    .map(|(params, span)| Generics {
        id: NodeId::PLACEHOLDER,
        span: context.span(span),
        params,
    })
    .context(StrContext::Label("generics"))
    .parse_next(input)
}

#[cfg(test)]
mod tests {
    use super::{parse_generic_argument, parse_generics};
    use crate::parser::string::test::{bind_parser, test_cases};

    // Bind our parsers to create testing functions
    bind_parser!(SyntaxDump; fn parse_generic_argument_test(parse_generic_argument));
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
