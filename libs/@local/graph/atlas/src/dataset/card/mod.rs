//! Canonical relation-card construction, rendering, and truncation.
//!
//! Cards are deterministic labeled text, never JSON. Datasource adapters
//! build [`contents::CardContents`] directly from their own rows -
//! [`phrase::Phrase::new`] normalizes labeled prose under a
//! [`CardContext`] - and hand it to [`build_card`] together with the
//! source identifiers they resolved, which the final text linter
//! forbids. Independent domain/range summaries and paired endpoint
//! constraints ([`constraints::EndpointConstraint`]) are distinct
//! blocks.
//!
//! The card text exists exactly once: sections are types whose [`Display`]
//! impls stream into the output, and every field borrows from the
//! adapter's data until whitespace normalization forces ownership.
//!
//! Truncation is structural. Descriptions divide into a lead sentence and
//! removable detail, then passes run in this fixed order:
//!
//! 1. drop example slots round-robin from the largest groups;
//! 2. remove ancestor and endpoint-type description detail;
//! 3. drop whole example groups while preserving one example;
//! 4. above the hard budget only, drop examples and then ancestors.
//!
//! Title, description, inverse, and endpoint-type summaries are never
//! dropped.
//!
//! [`Display`]: core::fmt::Display

#[cfg_attr(
    not(test),
    expect(
        unused_imports,
        reason = "the exported card surface; the lint dissolves when `render_card` wiring \
                  consumes it outside of tests"
    )
)]
pub(crate) use self::{
    context::CardContext,
    format::{Card, CardError, CardsConfig, build_card},
    lint::{IdentifierLeakError, lint_card_text},
    segment::{TextSegmenter, UnicodeSegmenter},
    token::{Cl100kTokenizer, HeuristicTokenizer, ReservedTokenError, Tokenizer},
};

pub(crate) mod hash;

mod constraints;
mod contents;
mod context;
mod epilogue;
mod example;
mod format;
mod group;
mod lint;
mod phrase;
mod prelude;
mod segment;
mod select;
mod text;
mod token;

#[cfg(test)]
mod tests;
