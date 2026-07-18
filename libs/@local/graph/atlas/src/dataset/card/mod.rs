//! Canonical relation-card construction, rendering, and truncation.
//!
//! Cards are deterministic labeled text, never JSON. Datasource adapters
//! build [`contents::CardContents`] directly from their own rows -
//! [`phrase::Phrase::new`] normalizes labeled prose under a
//! [`context::CardContext`] - and hand it to [`format::build_card`]
//! together with the source identifiers they resolved, which the final
//! text linter forbids. Independent domain/range summaries and paired
//! endpoint constraints ([`constraints::EndpointConstraint`]) are
//! distinct blocks.
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

pub(crate) mod constraints;
pub(crate) mod contents;
pub(crate) mod context;
pub(crate) mod epilogue;
pub(crate) mod example;
pub(crate) mod format;
pub(crate) mod group;
pub(crate) mod lint;
pub(crate) mod phrase;
pub(crate) mod prelude;
pub(crate) mod segment;
pub(crate) mod select;
pub(crate) mod text;
pub(crate) mod token;

#[cfg(test)]
mod tests;
