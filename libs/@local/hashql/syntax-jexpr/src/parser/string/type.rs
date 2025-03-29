use hashql_ast::node::{generic::GenericArgument, r#type::TypeKind};
use winnow::{ModalResult, Parser, combinator::alt, error::ParserError};

use super::context::Input;

fn parse_type_infer<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<TypeKind<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    "_".value(TypeKind::Infer).parse_next(input)
}
