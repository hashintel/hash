use hashql_core::span::SpanTable;
use hashql_diagnostics::{
    Diagnostic, Label, Patch, Suggestions, diagnostic::Message, severity::Critical,
};
use text_size::{TextRange, TextSize};

use super::{
    insert_range,
    lexer::{LexerDiagnostic, LexerDiagnosticCategory},
};
use crate::{
    lexer::{Number, ParseNumberErrorKind},
    span::Span,
};

const NUMBER_FORMAT_NOTE: &str =
    "JSON numbers follow the format `[-]digits[.digits][(e|E)[+|-]digits]`";

fn is_complete_json_number(candidate: &str) -> bool {
    Number::parse(candidate.as_bytes()).is_ok_and(|num| num.as_str().len() == candidate.len())
}

pub(crate) fn from_number_error(
    error: ParseNumberErrorKind,
    error_range: TextRange,
    token_range: TextRange,
    raw: &str,
    spans: &mut SpanTable<Span>,
) -> LexerDiagnostic {
    let base = token_range.start();

    if let Some(rest) = raw.strip_prefix('+') {
        return leading_plus_number_error(base, rest, spans);
    }

    if raw.starts_with('.') {
        return leading_dot_number_error(base, raw, spans);
    }

    let rel_pos =
        usize::from(error_range.start().checked_sub(base).unwrap_or_default()).min(raw.len());

    match error {
        ParseNumberErrorKind::UnexpectedDigit(_) => leading_zero_number_error(base, raw, spans),
        ParseNumberErrorKind::UnexpectedDot => {
            unexpected_dot_number_error(base, rel_pos, error_range, raw, spans)
        }
        ParseNumberErrorKind::UnexpectedExponent => {
            unexpected_exponent_number_error(base, rel_pos, error_range, raw, spans)
        }
        ParseNumberErrorKind::ExpectedDigit => {
            expected_digit_number_error(rel_pos, error_range, raw, spans)
        }
        ParseNumberErrorKind::UnexpectedEof => {
            let span = insert_range(spans, error_range);
            let mut diagnostic =
                Diagnostic::new(LexerDiagnosticCategory::InvalidNumber, Critical::ERROR).primary(
                    Label::new(span, "unexpected end of input in number literal"),
                );
            diagnostic.add_message(Message::note(NUMBER_FORMAT_NOTE));
            diagnostic
        }
    }
}

fn leading_plus_number_error(
    base: TextSize,
    rest: &str,
    spans: &mut SpanTable<Span>,
) -> LexerDiagnostic {
    let plus_span = insert_range(spans, TextRange::at(base, TextSize::new(1)));
    let mut diagnostic =
        Diagnostic::new(LexerDiagnosticCategory::InvalidNumber, Critical::ERROR).primary(
            Label::new(plus_span, "leading `+` is not allowed in JSON numbers"),
        );

    if is_complete_json_number(rest) {
        let suggestion = Suggestions::patch(Patch::new(plus_span, ""));
        diagnostic
            .add_message(Message::help("remove the leading `+`").with_suggestions(suggestion));
    } else {
        diagnostic.add_message(Message::help("remove the leading `+`"));
    }
    diagnostic.add_message(Message::note(NUMBER_FORMAT_NOTE));
    diagnostic
}

fn leading_dot_number_error(
    base: TextSize,
    raw: &str,
    spans: &mut SpanTable<Span>,
) -> LexerDiagnostic {
    let dot_span = insert_range(spans, TextRange::at(base, TextSize::new(1)));
    let insert_span = insert_range(spans, TextRange::empty(base));
    let mut diagnostic =
        Diagnostic::new(LexerDiagnosticCategory::InvalidNumber, Critical::ERROR).primary(
            Label::new(dot_span, "leading decimal point requires a leading `0`"),
        );

    let fixed = format!("0{raw}");
    if is_complete_json_number(&fixed) {
        let suggestion = Suggestions::patch(Patch::new(insert_span, "0"));
        diagnostic.add_message(Message::help("add a leading `0`").with_suggestions(suggestion));
    } else {
        diagnostic.add_message(Message::help("add a leading `0`, for example `0.5`"));
    }
    diagnostic.add_message(Message::note(NUMBER_FORMAT_NOTE));
    diagnostic
}

#[expect(
    clippy::cast_possible_truncation,
    clippy::string_slice,
    reason = "number tokens are pure ASCII and fit within u32 source bounds"
)]
fn leading_zero_number_error(
    base: TextSize,
    raw: &str,
    spans: &mut SpanTable<Span>,
) -> LexerDiagnostic {
    let digits_start = usize::from(raw.starts_with('-'));
    let zeros_end = raw[digits_start..]
        .bytes()
        .take_while(|&byte| byte == b'0')
        .count()
        + digits_start;

    // Keep one `0` when the integer part consists only of zeros (for example `000` or `00.5`).
    let strip_end = if raw
        .as_bytes()
        .get(zeros_end)
        .is_some_and(u8::is_ascii_digit)
    {
        zeros_end
    } else {
        zeros_end.saturating_sub(1).max(digits_start)
    };

    let zeros_range = TextRange::new(
        base + TextSize::new(digits_start as u32),
        base + TextSize::new(strip_end.max(digits_start + 1) as u32),
    );
    let zeros_span = insert_range(spans, zeros_range);

    let mut diagnostic =
        Diagnostic::new(LexerDiagnosticCategory::InvalidNumber, Critical::ERROR).primary(
            Label::new(zeros_span, "leading zeros are not allowed in JSON numbers"),
        );

    let stripped = format!("{}{}", &raw[..digits_start], &raw[strip_end..]);
    let zero_count = strip_end.saturating_sub(digits_start);
    let help_text = if zero_count == 1 {
        "remove the leading zero"
    } else {
        "remove the leading zeros"
    };

    if zero_count > 0 && is_complete_json_number(&stripped) {
        let patch_span = insert_range(
            spans,
            TextRange::new(
                base + TextSize::new(digits_start as u32),
                base + TextSize::new(strip_end as u32),
            ),
        );
        let suggestion = Suggestions::patch(Patch::new(patch_span, ""));
        diagnostic.add_message(Message::help(help_text).with_suggestions(suggestion));
    } else {
        diagnostic.add_message(Message::help(help_text));
    }
    diagnostic.add_message(Message::note(NUMBER_FORMAT_NOTE));
    diagnostic
}

#[expect(
    clippy::cast_possible_truncation,
    clippy::string_slice,
    reason = "number tokens are pure ASCII and fit within u32 source bounds"
)]
fn unexpected_dot_number_error(
    base: TextSize,
    rel_pos: usize,
    error_range: TextRange,
    raw: &str,
    spans: &mut SpanTable<Span>,
) -> LexerDiagnostic {
    let dot_range = if rel_pos < raw.len() {
        TextRange::at(base + TextSize::new(rel_pos as u32), TextSize::new(1))
    } else {
        error_range
    };
    let dot_span = insert_range(spans, dot_range);
    let prefix = &raw[..rel_pos];

    let mut diagnostic = if let Some(exp_idx) = prefix.find(['e', 'E']) {
        let mut diagnostic =
            Diagnostic::new(LexerDiagnosticCategory::InvalidNumber, Critical::ERROR).primary(
                Label::new(dot_span, "decimal point cannot appear in an exponent"),
            );
        let exp_span = insert_range(
            spans,
            TextRange::at(base + TextSize::new(exp_idx as u32), TextSize::new(1)),
        );
        diagnostic.add_label(Label::new(exp_span, "exponent started here"));
        diagnostic.add_message(Message::help("use an integer exponent such as `1e2`"));
        diagnostic
    } else {
        let mut diagnostic =
            Diagnostic::new(LexerDiagnosticCategory::InvalidNumber, Critical::ERROR).primary(
                Label::new(dot_span, "duplicate decimal point in number literal"),
            );
        if let Some(first_dot) = prefix.find('.') {
            let first_span = insert_range(
                spans,
                TextRange::at(base + TextSize::new(first_dot as u32), TextSize::new(1)),
            );
            diagnostic.add_label(Label::new(first_span, "decimal point already here"));
        }
        diagnostic.add_message(Message::help("remove the extra decimal point"));
        diagnostic
    };
    diagnostic.add_message(Message::note(NUMBER_FORMAT_NOTE));
    diagnostic
}

#[expect(
    clippy::cast_possible_truncation,
    clippy::string_slice,
    reason = "number tokens are pure ASCII and fit within u32 source bounds"
)]
fn unexpected_exponent_number_error(
    base: TextSize,
    rel_pos: usize,
    error_range: TextRange,
    raw: &str,
    spans: &mut SpanTable<Span>,
) -> LexerDiagnostic {
    let exp_range = if rel_pos < raw.len() {
        TextRange::at(base + TextSize::new(rel_pos as u32), TextSize::new(1))
    } else {
        error_range
    };
    let exp_span = insert_range(spans, exp_range);
    let mut diagnostic = Diagnostic::new(LexerDiagnosticCategory::InvalidNumber, Critical::ERROR)
        .primary(Label::new(exp_span, "duplicate exponent in number literal"));

    if let Some(first_exp) = raw[..rel_pos].find(['e', 'E']) {
        let first_span = insert_range(
            spans,
            TextRange::at(base + TextSize::new(first_exp as u32), TextSize::new(1)),
        );
        diagnostic.add_label(Label::new(first_span, "exponent already here"));
    }
    diagnostic.add_message(Message::help("remove the extra exponent"));
    diagnostic.add_message(Message::note(NUMBER_FORMAT_NOTE));
    diagnostic
}

fn expected_digit_number_error(
    rel_pos: usize,
    error_range: TextRange,
    raw: &str,
    spans: &mut SpanTable<Span>,
) -> LexerDiagnostic {
    let span = insert_range(spans, error_range);
    let prev = rel_pos
        .checked_sub(1)
        .and_then(|idx| raw.as_bytes().get(idx))
        .copied();

    let (label, help) = match prev {
        Some(b'.') => (
            "expected a digit after decimal point",
            "add fractional digits such as `0`, or remove the trailing `.`",
        ),
        Some(b'-') if rel_pos == 1 => (
            "expected a digit after `-`",
            "add digits after `-`, for example `-42`",
        ),
        Some(b'e' | b'E' | b'+' | b'-') => (
            "expected a digit in exponent",
            "add exponent digits, for example `1e10` or `1e+2`",
        ),
        _ => (
            "expected a digit in number literal",
            "use a valid JSON number such as `42`, `3.14`, or `1e10`",
        ),
    };

    let mut diagnostic = Diagnostic::new(LexerDiagnosticCategory::InvalidNumber, Critical::ERROR)
        .primary(Label::new(span, label));
    diagnostic.add_message(Message::help(help));
    diagnostic.add_message(Message::note(NUMBER_FORMAT_NOTE));
    diagnostic
}
