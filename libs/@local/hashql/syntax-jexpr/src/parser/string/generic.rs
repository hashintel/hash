use hashql_ast::node::{
    generic::{GenericArgument, GenericParam},
    id::NodeId,
};
use winnow::{ModalResult, Parser as _, combinator::opt, error::ParserError};

use super::context::Input;
use crate::parser::string::ident::parse_ident;

pub(crate) fn parse_generic_argument<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<GenericArgument, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let context = input.state;

    parse_ident
        .with_span()
        .map(|(name, span)| GenericArgument {
            id: NodeId::PLACEHOLDER,
            span: context.span(span),
            name,
        })
        .parse_next(input)
}

// fn parse_generic_param<'heap, 'span, 'source, E>(
//     input: &mut Input<'heap, 'span, 'source>,
// ) -> ModalResult<GenericParam<'heap>, E>
// where
//     E: ParserError<Input<'heap, 'span, 'source>>,
// {
//     let context = input.state;

//     let name = parse_ident;
//     let bound = opt((":", parse_type));
// }
