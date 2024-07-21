use bumpalo::Bump;
use smol_str::SmolStr;
use winnow::{
    combinator::todo,
    error::ParserError,
    stream::{AsChar, Compare, Stream, StreamIsPartial},
    PResult, Stateful,
};

use crate::{
    arena::{self, Arena},
    symbol::Symbol,
    r#type::Type,
};

pub struct Signature<'a> {
    generics: arena::Box<'a, [Generic<'a>]>,

    arguments: arena::Box<'a, [Argument]>,

    r#return: Return<'a>,
}

pub struct Generic<'a> {
    name: Symbol,
    bound: Type<'a>,
}

pub struct Argument {
    name: Symbol,
    r#type: Symbol,
}

pub struct Return<'a> {
    r#type: Type<'a>,
}

/// Implementation of [`Signature`] parsing
///
/// # Syntax
///
/// ```abnf
/// signature = [generics] "(" [ argument *("," argument) ] ")" "->" type
/// generics = "<" symbol [":" type ] ">"
/// argument = symbol [ ":" type ]
/// ```
fn parse_signature<'a, Input, Error>(
    input: &mut Stateful<Input, &'a Arena>,
) -> PResult<Signature<'a>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>,
    Error: ParserError<Input>,
{
    todo!()
}
