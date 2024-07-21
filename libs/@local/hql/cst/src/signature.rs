use bumpalo::Bump;
use smol_str::SmolStr;
use winnow::{
    combinator::{delimited, opt, preceded, repeat, separated, separated_pair, todo},
    error::ParserError,
    stream::{AsChar, Compare, Stream, StreamIsPartial},
    PResult, Parser, Stateful,
};

use crate::{
    arena::{self, Arena},
    parse::ws,
    symbol::{parse_symbol, Symbol},
    r#type::{parse_type, Type},
};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Signature<'a> {
    generics: arena::Box<'a, [Generic<'a>]>,

    arguments: arena::Box<'a, [Argument<'a>]>,

    r#return: Return<'a>,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Generic<'a> {
    name: Symbol,
    bound: Option<Type<'a>>,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Argument<'a> {
    name: Symbol,
    r#type: Type<'a>,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Return<'a> {
    r#type: Type<'a>,
}

/// Implementation of [`Signature`] parsing
// TODO: ability to omit return type?! (Needs to be like Unit type as return type)
/// # Syntax
///
/// ```abnf
/// signature = [generics] "(" [ argument *("," argument) ] ")" "->" type
/// generics = "<" symbol [":" type ] ">"
/// argument = symbol ":" type
/// ```
fn parse_signature<'a, Input, Error>(
    input: &mut Stateful<Input, &'a Arena>,
) -> PResult<Signature<'a>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>,
    Error: ParserError<Stateful<Input, &'a Arena>>,
{
    let arena = input.state;

    let generics = opt(parse_generics)
        .map(|generics| generics.unwrap_or_else(|| arena.vec(None).into_boxed_slice()));

    (generics, parse_argument_list, parse_return)
        .map(|(generics, arguments, r#return)| Signature {
            generics,
            arguments,
            r#return,
        })
        .parse_next(input)
}

fn parse_generic<'a, Input, Error>(
    input: &mut Stateful<Input, &'a Arena>,
) -> PResult<Generic<'a>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>,
    Error: ParserError<Stateful<Input, &'a Arena>>,
{
    (parse_symbol, opt(preceded(ws(':'), parse_type)))
        .map(|(name, bound)| Generic { name, bound })
        .parse_next(input)
}

// TODO: generics are not working properly, <> isn't working, also trailing , isn't
/// Implementation of generics parsing
///
/// # Syntax
///
/// ```abnf
/// generics = "<" symbol [":" type ] ">"
/// ```
fn parse_generics<'a, Input, Error>(
    input: &mut Stateful<Input, &'a Arena>,
) -> PResult<arena::Box<'a, [Generic<'a>]>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>,
    Error: ParserError<Stateful<Input, &'a Arena>>,
{
    let arena = input.state;

    delimited(
        ws('<'),
        opt((
            parse_generic,
            repeat(0.., preceded(ws(','), parse_generic)).fold(
                || arena.vec(None),
                |mut acc, generic| {
                    acc.push(generic);
                    acc
                },
            ),
            opt(ws(',')).void(),
        ))
        .map(|generics| match generics {
            Some((first, mut rest, ())) => {
                rest.insert(0, first);
                rest.into_boxed_slice()
            }
            None => arena.vec(Some(0)).into_boxed_slice(),
        }),
        ws('>'),
    )
    .parse_next(input)
}

/// Implementation of argument parsing
///
/// # Syntax
///
/// ```abnf
/// argument = symbol ":" type
/// ```
fn parse_argument<'a, Input, Error>(
    input: &mut Stateful<Input, &'a Arena>,
) -> PResult<Argument<'a>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>,
    Error: ParserError<Stateful<Input, &'a Arena>>,
{
    separated_pair(parse_symbol, ws(':'), parse_type)
        .map(|(name, r#type)| Argument { name, r#type })
        .parse_next(input)
}

/// Implementation of argument list parsing
///
/// # Syntax
///
/// ```abnf
/// argument-list = "(" [ argument *("," argument) ] ")"
/// argument = symbol ":" type
/// ```
fn parse_argument_list<'a, Input, Error>(
    input: &mut Stateful<Input, &'a Arena>,
) -> PResult<arena::Box<'a, [Argument<'a>]>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>,
    Error: ParserError<Stateful<Input, &'a Arena>>,
{
    let arena = input.state;

    delimited(
        ws('('),
        opt((
            parse_argument,
            repeat(0.., preceded(ws(','), parse_argument)).fold(
                || arena.vec(None),
                |mut acc, argument| {
                    acc.push(argument);
                    acc
                },
            ),
            opt(ws(',')).void(),
        ))
        .map(|value| match value {
            Some((first, mut rest, ())) => {
                rest.insert(0, first);
                rest.into_boxed_slice()
            }
            None => arena.vec(Some(0)).into_boxed_slice(),
        }),
        ws(')'),
    )
    .parse_next(input)
}

/// Implementation of return type parsing
///
/// # Syntax
///
/// ```abnf
/// return-type = "->" type
/// ```
fn parse_return<'a, Input, Error>(
    input: &mut Stateful<Input, &'a Arena>,
) -> PResult<Return<'a>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>,
    Error: ParserError<Stateful<Input, &'a Arena>>,
{
    preceded(ws("->"), parse_type)
        .map(|r#type| Return { r#type })
        .parse_next(input)
}

#[cfg(test)]
mod test {

    use insta::assert_debug_snapshot;
    use winnow::{
        error::{ContextError, ErrMode, ParseError},
        Parser, Stateful,
    };

    use super::Signature;
    use crate::arena::Arena;

    #[track_caller]
    fn parse<'a, 'b>(
        arena: &'a Arena,
        value: &'b str,
    ) -> Result<Signature<'a>, ParseError<Stateful<&'b str, &'a Arena>, ErrMode<ContextError>>>
    {
        let mut state = Stateful {
            input: value,
            state: arena,
        };

        super::parse_signature.parse(state)
    }

    #[track_caller]
    fn parse_ok<'a>(arena: &'a Arena, value: &str) -> Signature<'a> {
        parse(arena, value).expect("should be valid symbol")
    }

    #[test]
    fn bare() {
        let arena = Arena::new();

        assert_debug_snapshot!(parse_ok(&arena, "() -> Int"), @r###"
        Signature {
            generics: [],
            arguments: [],
            return: Return {
                type: Symbol(
                    Symbol(
                        "Int",
                    ),
                ),
            },
        }
        "###);
    }

    #[test]
    fn generics() {
        let arena = Arena::new();

        // assert_debug_snapshot!(parse_ok(&arena, "<>() -> Int"), @"");
        assert_debug_snapshot!(parse_ok(&arena, " <T> () -> Int"), @r###"
        Signature {
            generics: [
                Generic {
                    name: Symbol(
                        "T",
                    ),
                    bound: None,
                },
            ],
            arguments: [],
            return: Return {
                type: Symbol(
                    Symbol(
                        "Int",
                    ),
                ),
            },
        }
        "###);
        assert_debug_snapshot!(parse_ok(&arena, "<T>() -> Int"), @r###"
        Signature {
            generics: [
                Generic {
                    name: Symbol(
                        "T",
                    ),
                    bound: None,
                },
            ],
            arguments: [],
            return: Return {
                type: Symbol(
                    Symbol(
                        "Int",
                    ),
                ),
            },
        }
        "###);
        assert_debug_snapshot!(parse_ok(&arena, "<T: Int>() -> Int"), @r###"
        Signature {
            generics: [
                Generic {
                    name: Symbol(
                        "T",
                    ),
                    bound: Some(
                        Symbol(
                            Symbol(
                                "Int",
                            ),
                        ),
                    ),
                },
            ],
            arguments: [],
            return: Return {
                type: Symbol(
                    Symbol(
                        "Int",
                    ),
                ),
            },
        }
        "###);
        assert_debug_snapshot!(parse_ok(&arena, "<T:Int>() -> Int"), @r###"
        Signature {
            generics: [
                Generic {
                    name: Symbol(
                        "T",
                    ),
                    bound: Some(
                        Symbol(
                            Symbol(
                                "Int",
                            ),
                        ),
                    ),
                },
            ],
            arguments: [],
            return: Return {
                type: Symbol(
                    Symbol(
                        "Int",
                    ),
                ),
            },
        }
        "###);
        assert_debug_snapshot!(parse_ok(&arena, "<T: Int, U>() -> Int"), @r###"
        Signature {
            generics: [
                Generic {
                    name: Symbol(
                        "T",
                    ),
                    bound: Some(
                        Symbol(
                            Symbol(
                                "Int",
                            ),
                        ),
                    ),
                },
                Generic {
                    name: Symbol(
                        "U",
                    ),
                    bound: None,
                },
            ],
            arguments: [],
            return: Return {
                type: Symbol(
                    Symbol(
                        "Int",
                    ),
                ),
            },
        }
        "###);
        assert_debug_snapshot!(parse_ok(&arena, "<T,U>() -> Int"), @r###"
        Signature {
            generics: [
                Generic {
                    name: Symbol(
                        "T",
                    ),
                    bound: None,
                },
                Generic {
                    name: Symbol(
                        "U",
                    ),
                    bound: None,
                },
            ],
            arguments: [],
            return: Return {
                type: Symbol(
                    Symbol(
                        "Int",
                    ),
                ),
            },
        }
        "###);
        assert_debug_snapshot!(parse_ok(&arena, "<T,U,>() -> Int"), @"");
    }

    #[test]
    fn arguments() {
        let arena = Arena::new();

        assert_debug_snapshot!(parse_ok(&arena, "() -> Int"), @r###"
        Signature {
            generics: [],
            arguments: [],
            return: Return {
                type: Symbol(
                    Symbol(
                        "Int",
                    ),
                ),
            },
        }
        "###);
        assert_debug_snapshot!(parse_ok(&arena, "(a: Int) -> Int"), @r###"
        Signature {
            generics: [],
            arguments: [
                Argument {
                    name: Symbol(
                        "a",
                    ),
                    type: Symbol(
                        Symbol(
                            "Int",
                        ),
                    ),
                },
            ],
            return: Return {
                type: Symbol(
                    Symbol(
                        "Int",
                    ),
                ),
            },
        }
        "###);
        assert_debug_snapshot!(parse_ok(&arena, "(a:Int) -> Int"), @r###"
        Signature {
            generics: [],
            arguments: [
                Argument {
                    name: Symbol(
                        "a",
                    ),
                    type: Symbol(
                        Symbol(
                            "Int",
                        ),
                    ),
                },
            ],
            return: Return {
                type: Symbol(
                    Symbol(
                        "Int",
                    ),
                ),
            },
        }
        "###);
        assert_debug_snapshot!(parse_ok(&arena, "(a: Int, b: Int) -> Int"), @r###"
        Signature {
            generics: [],
            arguments: [
                Argument {
                    name: Symbol(
                        "a",
                    ),
                    type: Symbol(
                        Symbol(
                            "Int",
                        ),
                    ),
                },
                Argument {
                    name: Symbol(
                        "b",
                    ),
                    type: Symbol(
                        Symbol(
                            "Int",
                        ),
                    ),
                },
            ],
            return: Return {
                type: Symbol(
                    Symbol(
                        "Int",
                    ),
                ),
            },
        }
        "###);
        assert_debug_snapshot!(parse_ok(&arena, "(a: Int,) -> Int"), @r###"
        Signature {
            generics: [],
            arguments: [
                Argument {
                    name: Symbol(
                        "a",
                    ),
                    type: Symbol(
                        Symbol(
                            "Int",
                        ),
                    ),
                },
            ],
            return: Return {
                type: Symbol(
                    Symbol(
                        "Int",
                    ),
                ),
            },
        }
        "###);
    }

    #[test]
    fn return_type() {
        let arena = Arena::new();

        assert_debug_snapshot!(parse_ok(&arena, "() -> Int"), @r###"
        Signature {
            generics: [],
            arguments: [],
            return: Return {
                type: Symbol(
                    Symbol(
                        "Int",
                    ),
                ),
            },
        }
        "###);
        assert_debug_snapshot!(parse_ok(&arena, "() -> Int | Bool"), @r###"
        Signature {
            generics: [],
            arguments: [],
            return: Return {
                type: Union(
                    [
                        Symbol(
                            Symbol(
                                "Int",
                            ),
                        ),
                        Symbol(
                            Symbol(
                                "Bool",
                            ),
                        ),
                    ],
                ),
            },
        }
        "###);
        assert_debug_snapshot!(parse_ok(&arena, "() -> Int | Bool & Float"), @r###"
        Signature {
            generics: [],
            arguments: [],
            return: Return {
                type: Intersection(
                    [
                        Union(
                            [
                                Symbol(
                                    Symbol(
                                        "Int",
                                    ),
                                ),
                                Symbol(
                                    Symbol(
                                        "Bool",
                                    ),
                                ),
                            ],
                        ),
                        Symbol(
                            Symbol(
                                "Float",
                            ),
                        ),
                    ],
                ),
            },
        }
        "###);
    }
}
