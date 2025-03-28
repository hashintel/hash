use hashql_cst::r#type::{Type, TypeKind};
use winnow::{
    ModalResult, Parser as _, Stateful,
    combinator::{alt, delimited, preceded, repeat},
    error::ParserError,
    stream::{AsChar, Compare, Location, Stream, StreamIsPartial},
};

use super::{
    IntoTextRange as _,
    path::parse_path,
    string::{self, ParseState},
    symbol::ParseRestriction,
};
use crate::span::Span;

/// Implementation of [`Type`] parsing
///
/// Types are only allowed to be valid rust symbols, operators are *not* allowed.
///
/// # Syntax
///
/// ```abnf
/// primary = path-safe / enclosed
/// enclosed = "(" type ")"
/// union = primary *("|" primary)
/// intersection = union *("&" union)
/// type = intersection
/// ```
pub(crate) fn parse_type<'arena, 'spans, Input, Error>(
    input: &mut Stateful<Input, ParseState<'arena, 'spans>>,
) -> ModalResult<Type<'arena>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>
        + Location,
    Error: ParserError<Stateful<Input, ParseState<'arena, 'spans>>>,
{
    parse_intersection.parse_next(input)
}

fn parse_primary<'arena, 'spans, Input, Error>(
    input: &mut Stateful<Input, ParseState<'arena, 'spans>>,
) -> ModalResult<Type<'arena>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>
        + Location,
    Error: ParserError<Stateful<Input, ParseState<'arena, 'spans>>>,
{
    let state = input.state;

    alt((
        parse_enclosed, //
        parse_path(ParseRestriction::SafeOnly)
            .with_span()
            .map(move |(path, range)| {
                let span = state.spans.insert(Span {
                    range: range.range_trunc(),
                    pointer: None,
                    parent_id: state.parent_id,
                });

                Type {
                    kind: TypeKind::Path(path),
                    span,
                }
            }),
    ))
    .parse_next(input)
}

fn parse_enclosed<'arena, 'spans, Input, Error>(
    input: &mut Stateful<Input, ParseState<'arena, 'spans>>,
) -> ModalResult<Type<'arena>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>
        + Location,
    Error: ParserError<Stateful<Input, ParseState<'arena, 'spans>>>,
{
    delimited('(', parse_type, ')').parse_next(input)
}

fn parse_union<'arena, 'spans, Input, Error>(
    input: &mut Stateful<Input, ParseState<'arena, 'spans>>,
) -> ModalResult<Type<'arena>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>
        + Location,
    Error: ParserError<Stateful<Input, ParseState<'arena, 'spans>>>,
{
    let state = input.state;

    (
        parse_primary,
        repeat(0.., preceded(string::ws('|'), parse_primary)).fold(
            || state.arena.vec(None),
            |mut acc, value: Type<'arena>| {
                acc.push(value);
                acc
            },
        ),
    )
        .with_span()
        .map(|((head, mut tail), range)| {
            if tail.is_empty() {
                head
            } else {
                tail.insert(0, head);

                let kind = TypeKind::Union(tail.into_boxed_slice());

                let span = state.spans.insert(Span {
                    range: range.range_trunc(),
                    pointer: None,
                    parent_id: state.parent_id,
                });

                Type { kind, span }
            }
        })
        .parse_next(input)
}

fn parse_intersection<'arena, 'spans, Input, Error>(
    input: &mut Stateful<Input, ParseState<'arena, 'spans>>,
) -> ModalResult<Type<'arena>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>
        + Location,
    Error: ParserError<Stateful<Input, ParseState<'arena, 'spans>>>,
{
    let state = input.state;

    (
        parse_union,
        repeat(0.., preceded(string::ws('&'), parse_union)).fold(
            || state.arena.vec(None),
            |mut acc, value: Type<'arena>| {
                acc.push(value);
                acc
            },
        ),
    )
        .with_span()
        .map(|((head, mut tail), range)| {
            if tail.is_empty() {
                head
            } else {
                tail.insert(0, head);

                let kind = TypeKind::Intersection(tail.into_boxed_slice());

                let span = state.spans.insert(Span {
                    range: range.range_trunc(),
                    pointer: None,
                    parent_id: state.parent_id,
                });

                Type { kind, span }
            }
        })
        .parse_next(input)
}

#[cfg(test)]
mod test {
    use hashql_cst::arena::MemoryPool;
    use hashql_span::storage::SpanStorage;
    use insta::assert_snapshot;
    use winnow::{
        LocatingSlice, Parser as _, Stateful,
        error::{ContextError, ErrMode, ParseError},
    };

    use super::Type;
    use crate::parser::string::ParseState;

    #[track_caller]
    #[expect(clippy::type_complexity, reason = "test code")]
    fn parse<'arena, 'spans, 'input>(
        state: ParseState<'arena, 'spans>,
        value: &'input str,
    ) -> Result<
        Type<'arena>,
        ParseError<
            Stateful<LocatingSlice<&'input str>, ParseState<'arena, 'spans>>,
            ErrMode<ContextError>,
        >,
    > {
        let state = Stateful {
            input: LocatingSlice::new(value),
            state,
        };

        super::parse_type.parse(state)
    }

    #[track_caller]
    fn parse_ok<'arena>(state: ParseState<'arena, '_>, value: &str) -> Type<'arena> {
        parse(state, value).expect("should be valid symbol")
    }

    macro_rules! setup {
        ($state:ident) => {
            let arena = Arena::new();
            let spans = SpanStorage::new();

            let $state = ParseState {
                arena: &arena,
                spans: &spans,
                parent_id: None,
            };
        };
    }

    #[test]
    fn union() {
        setup!(state);

        assert_snapshot!(parse_ok(state, "Int"), @"Int");
        assert_snapshot!(parse_ok(state, "Int | Float"), @"(Int | Float)");
        assert_snapshot!(parse_ok(state, "Int | Float | Bool"), @"(Int | Float | Bool)");
    }

    #[test]
    fn path() {
        setup!(state);

        assert_snapshot!(parse_ok(state, "core::Int"), @"core::Int");
    }

    #[test]
    fn safe_operator() {
        setup!(state);

        assert_snapshot!(parse_ok(state, "`+`"), @"+");
        assert_snapshot!(parse_ok(state, "core::`+`"), @"core::+");
    }

    #[test]
    fn intersection() {
        setup!(state);

        assert_snapshot!(parse_ok(state, "Int"), @"Int");
        assert_snapshot!(parse_ok(state, "Int & Float"), @"(Int & Float)");
        assert_snapshot!(parse_ok(state, "Int & Float & Bool"), @"(Int & Float & Bool)");
    }

    #[test]
    fn precedence() {
        setup!(state);

        assert_snapshot!(parse_ok(state, "Int | Float & Bool"), @"((Int | Float) & Bool)");
        assert_snapshot!(parse_ok(state, "Int & Float | Bool"), @"(Int & (Float | Bool))");
        assert_snapshot!(parse_ok(state, "Int & (Float | Bool)"), @"(Int & (Float | Bool))");
    }

    #[test]
    fn whitespace() {
        setup!(state);

        assert_snapshot!(parse_ok(state, "Int|Float&Bool"), @"((Int | Float) & Bool)");
        assert_snapshot!(parse_ok(state, "Int | Float & Bool"), @"((Int | Float) & Bool)");
        assert_snapshot!(parse_ok(state, "Int   |   Float   &   Bool"), @"((Int | Float) & Bool)");
    }

    #[test]
    fn enclosed() {
        setup!(state);

        assert_snapshot!(parse_ok(state, "(Int)"), @"Int");
        assert_snapshot!(parse_ok(state, "(Int | Float)"), @"(Int | Float)");
        assert_snapshot!(parse_ok(state, "(Int | Float) & Bool"), @"((Int | Float) & Bool)");
    }

    #[test]
    fn symbol() {
        setup!(state);

        assert_snapshot!(parse_ok(state, "Int"), @"Int");
        assert_snapshot!(parse_ok(state, "Float"), @"Float");
        assert_snapshot!(parse_ok(state, "Bool"), @"Bool");
    }
}
