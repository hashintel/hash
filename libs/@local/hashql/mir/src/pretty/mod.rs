//! Pretty-printing and formatting utilities for MIR (Middle Intermediate Representation).
//!
//! This module provides formatters for rendering MIR bodies in human-readable formats:
//!
//! - **Text formatting** ([`TextFormat`]) - Produces readable text output for debugging and
//!   analysis, similar to rustc's MIR dump format
//! - **D2 formatting** ([`D2Format`]) - Generates D2 diagram code for visual representation of
//!   control flow graphs with embedded HTML tables
//!
//! Both formatters support customizable source lookup and data flow analysis integration
//! through the [`SourceLookup`] and [`DataFlowLookup`] traits.

use core::{fmt::Display, iter};
use std::io;

use crate::{
    body::{Body, Source, basic_block::BasicBlockId},
    def::{DefId, DefIdSlice},
};

mod d2;
mod text;

pub use d2::{D2Buffer, D2Format};
pub use text::{TextFormat, TextFormatAnnotations, TextFormatOptions};

/// A trait for looking up source information associated with function definitions.
///
/// This trait provides access to the original source code or metadata that was used
/// to generate the MIR representation. It's used by formatters to resolve symbols,
/// display readable names, and provide context about where constructs originated.
pub trait SourceLookup<'heap> {
    /// Retrieves the source information for a given definition ID.
    ///
    /// Returns [`Some`] with the associated [`Source`] if the definition exists
    /// and has source information available, or [`None`] if no source is found.
    fn source(&self, def: DefId) -> Option<Source<'heap>>;
}

impl<'heap, T: ?Sized + SourceLookup<'heap>> SourceLookup<'heap> for &T {
    fn source(&self, def: DefId) -> Option<Source<'heap>> {
        T::source(self, def)
    }
}

impl<'heap> SourceLookup<'heap> for DefIdSlice<Body<'heap>> {
    fn source(&self, def: DefId) -> Option<Source<'heap>> {
        self.get(def).map(|body| body.source)
    }
}

impl<'heap> SourceLookup<'heap> for () {
    fn source(&self, _: DefId) -> Option<Source<'heap>> {
        None
    }
}

/// A trait for providing data flow analysis information during formatting.
///
/// This trait allows formatters to augment their output with additional analysis data,
/// such as live variables, reaching definitions, or other program analysis results.
/// The data is presented in tabular form with customizable column headers.
pub trait DataFlowLookup<'heap> {
    /// Column headers for the data flow analysis display.
    ///
    /// These strings will be used as column headers in formatted output,
    /// with each column corresponding to one piece of analysis information.
    const COLUMNS: &'static [&'static str];

    /// Whether to display analysis information at basic block entry and exit points.
    ///
    /// When `true`, the formatter will call [`on_enter`] and [`on_exit`] to show
    /// analysis state at block boundaries. When `false`, only per-statement
    /// information from [`on_statement`] is displayed.
    ///
    /// [`on_enter`]: DataFlowLookup::on_enter
    /// [`on_exit`]: DataFlowLookup::on_exit
    /// [`on_statement`]: DataFlowLookup::on_statement
    const DISPLAY_ENTRY: bool = false;

    /// Provides analysis data at basic block entry.
    ///
    /// Called when formatting begins processing a basic block, if [`DISPLAY_ENTRY`]
    /// is `true`. Should return an iterator of displayable values, one for each
    /// column defined in [`COLUMNS`].
    ///
    /// [`DISPLAY_ENTRY`]: DataFlowLookup::DISPLAY_ENTRY
    /// [`COLUMNS`]: DataFlowLookup::COLUMNS
    fn on_enter(
        &self,
        def: DefId,
        block: BasicBlockId,
    ) -> impl IntoIterator<Item: Display> + use<'heap, Self>;

    /// Provides analysis data at basic block exit.
    ///
    /// Called when formatting completes processing a basic block, if [`DISPLAY_ENTRY`]
    /// is `true`. Should return an iterator of displayable values, one for each
    /// column defined in [`COLUMNS`].
    ///
    /// [`DISPLAY_ENTRY`]: DataFlowLookup::DISPLAY_ENTRY
    /// [`COLUMNS`]: DataFlowLookup::COLUMNS
    fn on_exit(
        &self,
        def: DefId,
        block: BasicBlockId,
    ) -> impl IntoIterator<Item: Display> + use<'heap, Self>;

    /// Provides analysis data after processing a statement.
    ///
    /// Called for each statement in a basic block during formatting. Should return
    /// an iterator of displayable values, one for each column defined in [`COLUMNS`].
    ///
    /// [`COLUMNS`]: DataFlowLookup::COLUMNS
    fn on_statement(
        &self,
        def: DefId,
        block: BasicBlockId,
        statement: usize,
    ) -> impl IntoIterator<Item: Display> + use<'heap, Self>;
}

/// No-op implementation of [`DataFlowLookup`] for when no analysis data is needed.
impl<'heap> DataFlowLookup<'heap> for () {
    const COLUMNS: &'static [&'static str] = &[];

    fn on_enter(&self, _: DefId, _: BasicBlockId) -> impl IntoIterator<Item: Display> + use<'heap> {
        iter::empty::<!>()
    }

    fn on_exit(&self, _: DefId, _: BasicBlockId) -> impl IntoIterator<Item: Display> + use<'heap> {
        iter::empty::<!>()
    }

    fn on_statement(
        &self,
        _: DefId,
        _: BasicBlockId,
        _: usize,
    ) -> impl IntoIterator<Item: Display> + use<'heap> {
        iter::empty::<!>()
    }
}

pub(crate) trait FormatPart<V> {
    fn format_part(&mut self, value: V) -> io::Result<()>;
}
