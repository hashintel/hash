use hashql_core::span::SpanId;
use hashql_diagnostics::Diagnostic;

use crate::{
    ParserState,
    error::ResultExt as _,
    lexer::{error::LexerDiagnosticCategory, syntax_kind_set::SyntaxKindSet},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum VerifyState {
    Consecutive,
    Trailing,
}

pub(crate) fn verify_no_repeat<C>(
    state: &mut ParserState<'_, '_, '_>,
    deny: SyntaxKindSet,
    end: SyntaxKindSet,
    on_error: impl FnOnce(
        &mut ParserState<'_, '_, '_>,
        Vec<SpanId>,
        VerifyState,
    ) -> Diagnostic<C, SpanId>,
) -> Result<(), Diagnostic<C, SpanId>>
where
    C: From<LexerDiagnosticCategory>,
{
    // Do a "soft peek" instead of a required peek. This way we can propagate the EOF upstream.
    let Some(next) = state.peek().change_category(C::from)? else {
        return Ok(());
    };
    let next_syntax = next.kind.syntax();

    if !deny.contains(next_syntax) && !end.contains(next_syntax) {
        // neither a separator nor an end token, this means there are no consecutive or trailing
        // tokens
        return Ok(());
    }

    let mut spans = vec![];

    let mut verify = VerifyState::Consecutive;
    // We are now on an error path, we need to figure out
    // 1) how many consecutive tokens that are denied to we have
    // 2) is the decision trailing or consecutive

    loop {
        // in the first loop, we refetch here, but this just makes operating on the stream easier
        let token = state
            .peek_expect(SyntaxKindSet::COMPLETE)
            .change_category(C::from)?;

        let token_span = token.span;
        let token_syntax = token.kind.syntax();

        if !deny.contains(token_syntax) {
            // we're no longer encountering any denied tokens. We now need to figure out:
            //  is it trailing or consecutive?
            if end.contains(token_syntax) {
                verify = VerifyState::Trailing;
            }

            // we do **not** consume the token, to ensure that recovery parsing in the future can
            // continue from this point

            break;
        }

        // Token that is denied, therefore advance the stream and add it to the spans
        spans.push(token_span);
        state
            .advance(SyntaxKindSet::COMPLETE)
            .change_category(C::from)?;
    }

    // materialize the spans
    let spans: Vec<_> = spans
        .into_iter()
        .map(|range| state.insert_range(range))
        .collect();

    Err(on_error(state, spans, verify))
}
