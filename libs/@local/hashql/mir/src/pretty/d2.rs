use core::{
    fmt::{self, Display},
    iter, mem,
};
use std::io;

use bstr::ByteSlice as _;
use hashql_core::{pretty::RenderFormat, r#type::TypeFormatter};

use super::{DataFlowLookup, FormatPart, SourceLookup, TextFormat, text::HighlightBody};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlock, BasicBlockId},
        terminator::{Goto, GraphRead, SwitchInt, TerminatorKind},
    },
    def::{DefId, DefIdSlice},
    pretty::text::{Signature, SignatureOptions, TargetParams, TerminatorHead},
};

#[derive(Debug, Default)]
pub struct D2Buffer {
    front: Vec<u8>,
    back: Vec<u8>,
}

impl D2Buffer {
    fn clear(&mut self) {
        self.front.clear();
        self.back.clear();
    }

    const fn swap(&mut self) {
        mem::swap(&mut self.front, &mut self.back);
    }
}

/// A formatter that generates D2 diagram code from MIR bodies.
///
/// D2 is a text-based diagramming language that can render control flow graphs
/// and other structured diagrams. This formatter converts MIR (Middle Intermediate
/// Representation) bodies into D2 syntax, creating visual representations of the
/// control flow and data flow within functions.
///
/// The formatter generates HTML tables embedded within D2 shapes to display:
/// - Basic block identifiers and parameters
/// - MIR statements with line numbers
/// - Terminator instructions
/// - Optional data flow analysis columns
///
/// # Type Parameters
///
/// - `W`: A writer implementing [`io::Write`] for output
/// - `S`: A source lookup implementing [`SourceLookup`] for symbol resolution
/// - `D`: A data flow lookup implementing [`DataFlowLookup`] for analysis data
pub struct D2Format<'fmt, 'heap, W, S, D> {
    /// The writer where D2 output will be written
    pub writer: W,
    /// Source lookup for resolving symbols and identifiers
    pub sources: S,
    /// Data flow analysis lookup for auxiliary columns
    pub dataflow: D,
    /// Buffer used for text formatting
    pub buffer: D2Buffer,
    /// Type formatter for formatting type information
    pub types: TypeFormatter<'fmt, 'fmt, 'heap>,
}

impl<'fmt, 'heap, W, S, D> D2Format<'fmt, 'heap, W, S, D>
where
    W: io::Write,
{
    /// Formats a collection of MIR bodies as D2 diagram code.
    ///
    /// This is the main entry point for the formatter. It processes all the provided
    /// MIR bodies and generates D2 syntax that represents their control flow graphs.
    /// Each body becomes a separate diagram section with interconnected basic blocks.
    ///
    /// # Errors
    ///
    /// Returns an [`io::Error`] if writing to the underlying writer fails.
    pub fn format(
        &mut self,
        bodies: &DefIdSlice<Body<'heap>>,
        highlight: &[DefId],
    ) -> io::Result<()>
    where
        S: SourceLookup<'heap>,
        D: DataFlowLookup<'heap>,
    {
        self.format_part((bodies, HighlightBody(highlight)))
    }

    fn format_text_unescaped<V>(&mut self, value: V) -> io::Result<()>
    where
        for<'a> TextFormat<&'a mut W, &'a S, &'a mut TypeFormatter<'fmt, 'fmt, 'heap>>:
            FormatPart<V>,
    {
        TextFormat {
            writer: &mut self.writer,
            indent: 0,
            sources: &self.sources,
            types: &mut self.types,
        }
        .format_part(value)
    }

    fn format_text<V>(&mut self, value: V) -> io::Result<()>
    where
        for<'a> TextFormat<&'a mut Vec<u8>, &'a S, &'a mut TypeFormatter<'fmt, 'fmt, 'heap>>:
            FormatPart<V>,
    {
        const REPLACEMENTS: [(u8, &[u8]); 4] = [
            (b'&', b"&amp;" as &[_]),
            // (b'"', b"&quot;"),
            (b'<', b"&lt;"),
            (b'>', b"&gt;"),
            (b'\n', br#"<br align="left"/>"#),
        ];
        self.buffer.clear();

        TextFormat {
            writer: &mut self.buffer.front,
            indent: 0,
            sources: &self.sources,
            types: &mut self.types,
        }
        .format_part(value)?;

        self.buffer.back.reserve(self.buffer.front.len());

        for (needle, replacement) in REPLACEMENTS {
            self.buffer
                .front
                .replace_into([needle], replacement, &mut self.buffer.back);
            self.buffer.swap();
            self.buffer.back.clear();
        }

        self.writer.write_all(&self.buffer.front)?;
        self.buffer.clear();

        Ok(())
    }

    fn write_row<V>(
        &mut self,
        valign_bottom: bool,
        index: impl Display,
        part: V,
        aux: impl IntoIterator<Item: Display>,
    ) -> io::Result<()>
    where
        for<'a> TextFormat<&'a mut Vec<u8>, &'a S, &'a mut TypeFormatter<'fmt, 'fmt, 'heap>>:
            FormatPart<V>,
    {
        let valign = if valign_bottom { "bottom" } else { "top" };
        let fmt = format_args!(r#"valign="{valign}" sides="tl""#);

        write!(self.writer, "<tr>")?;
        write!(self.writer, r#"<td {fmt} align="right">{index}</td>"#)?;
        write!(self.writer, r#"<td {fmt} align="left">"#)?;
        self.format_text(part)?;
        write!(self.writer, "</td>")?;

        for col in aux {
            write!(self.writer, r#"<td {fmt} align="left">{col}</td>"#)?;
        }

        write!(self.writer, "</tr>")
    }

    fn write_terminator(
        &mut self,
        block_id: BasicBlockId,
        block: &BasicBlock<'heap>,
    ) -> io::Result<()>
    where
        S: SourceLookup<'heap>,
    {
        // Now we need to do the connections to the other blocks
        match &block.terminator.kind {
            TerminatorKind::Goto(Goto { target }) => {
                write!(
                    self.writer,
                    "{} -> {}: '",
                    BasicBlockName(block_id),
                    BasicBlockName(target.block),
                )?;
                self.format_text(TargetParams(target.args))?;
                writeln!(self.writer, "'")?;
            }
            TerminatorKind::SwitchInt(SwitchInt {
                discriminant: _,
                targets,
            }) => {
                for (value, target) in targets.iter() {
                    write!(
                        self.writer,
                        "{} -> {}: {{ source-arrowhead.label: {}; label: '",
                        BasicBlockName(block_id),
                        BasicBlockName(target.block),
                        value,
                    )?;
                    self.format_text(TargetParams(target.args))?;
                    writeln!(self.writer, "' }}")?;
                }

                if let Some(otherwise) = targets.otherwise() {
                    write!(
                        self.writer,
                        "{} -> {}: {{ source-arrowhead.label: 'otherwise'; label: '",
                        BasicBlockName(block_id),
                        BasicBlockName(otherwise.block)
                    )?;
                    self.format_text(TargetParams(otherwise.args))?;
                    writeln!(self.writer, "'; style.stroke-dash: 3 }}")?;
                }
            }
            TerminatorKind::Return(_) | TerminatorKind::Unreachable => {}
            TerminatorKind::GraphRead(GraphRead {
                head: _,
                body: _,
                tail: _,
                target,
            }) => {
                writeln!(
                    self.writer,
                    "{} -> {}: '(_)'",
                    BasicBlockName(block_id),
                    BasicBlockName(*target),
                )?;
            }
        }

        Ok(())
    }
}

const HEADER_A_BB_BG_COLOR: &str = "#111D4A";
const HEADER_A_BB_FG_COLOR: &str = "#FFF";
const HEADER_A_AUX_BG_COLOR: &str = "#F18805";
const HEADER_A_AUX_FG_COLOR: &str = "#000";
const HEADER_B_MIR_BG_COLOR: &str = "#C2CAE8";
const HEADER_B_MIR_FG_COLOR: &str = "#000";
const HEADER_B_AUX_BG_COLOR: &str = "#F0A202";
const HEADER_B_AUX_FG_COLOR: &str = "#000";

struct BasicBlockName(BasicBlockId);

impl fmt::Display for BasicBlockName {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "bb{}", self.0)
    }
}

/// Generates an HTML table for embedding inside D2 shapes to represent basic blocks.
///
/// This implementation creates structured HTML tables that D2 can render as part of
/// diagram nodes. The table layout adapts based on the number of auxiliary columns
/// provided by the data flow analysis:
///
/// **No auxiliary columns:**
/// ```text
///   ┌──────────────────────────────────────────┐
/// A │                   bb0                    │
///   ├──────────────────────────────────────────┤
/// B │                   MIR                    │
///   ├─┬────────────────────────────────────────┤
///   │ │                                        │
///   └─┴────────────────────────────────────────┘
/// ```
///
/// **Single auxiliary column:**
/// ```text
///   ┌──────────────────────────────────────────┐
/// A │                   bb0                    │
///   ├────────────────────────────┬─────────────┤
/// B │            MIR             │     AUX     │
///   ├─┬──────────────────────────┼─────────────┤
///   │ │                          │             │
///   └─┴──────────────────────────┴─────────────┘
/// ```
///
/// **Multiple auxiliary columns:**
/// ```text
///   ┌────────────────────────────┬─────────────┐
/// A │            bb0             │    STATE    │
///   ├────────────────────────────┼──────┬──────┤
/// B │            MIR             │ AUX1 │ AUX2 │
///   ├─┬──────────────────────────┼──────┼──────┤
///   │ │                          │      │      │
///   └─┴──────────────────────────┴──────┴──────┘
/// ```
///
/// The table includes:
/// - Basic block name and parameters in the header (row A)
/// - Column headers for MIR and auxiliary data (row B)
/// - Individual rows for each statement with optional data flow information
/// - Terminator instruction at the bottom
impl<'heap, W, S, D> FormatPart<(DefId, BasicBlockId, &BasicBlock<'heap>)>
    for D2Format<'_, 'heap, W, S, D>
where
    W: io::Write,
    S: SourceLookup<'heap>,
    D: DataFlowLookup<'heap>,
{
    fn format_part(
        &mut self,
        (def_id, block_id, block): (DefId, BasicBlockId, &BasicBlock<'heap>),
    ) -> io::Result<()> {
        writeln!(self.writer, "{}: |`md", BasicBlockName(block_id))?;

        self.writer.write_all(
            br#"<table border="1" cellborder="1" cellspacing="0" cellpadding="3" sides="rb">"#,
        )?;

        let aux_columns = D::COLUMNS;

        // Header A:
        write!(self.writer, "<tr>")?;
        write!(
            self.writer,
            r#"<td colspan="{len}" style="color: {HEADER_A_BB_FG_COLOR}; background-color: {HEADER_A_BB_BG_COLOR}" sides="tl">{name}("#,
            len = if aux_columns.len() == 1 { 3 } else { 2 },
            name = BasicBlockName(block_id)
        )?;
        for (index, param) in block.params.iter().enumerate() {
            if index != 0 {
                write!(self.writer, ", ")?;
            }

            write!(self.writer, "%{param}")?;
        }
        write!(self.writer, ")</td>")?;

        // If it's a single column we push said column *down* and don't show it in the header
        if aux_columns.len() > 1 {
            write!(
                self.writer,
                r#"<td colspan="{len}" style="color: {HEADER_A_AUX_FG_COLOR}; background-color: {HEADER_A_AUX_BG_COLOR}">STATE</td>"#,
                len = aux_columns.len(),
            )?;
        }
        write!(self.writer, "</tr>")?;

        // Header B:
        write!(self.writer, "<tr>")?;
        write!(
            self.writer,
            r#"<td colspan="2" style="color: {HEADER_B_MIR_FG_COLOR}; background-color: {HEADER_B_MIR_BG_COLOR}">MIR</td>"#
        )?;
        for state in aux_columns {
            write!(
                self.writer,
                r#"<td style="color: {HEADER_B_AUX_FG_COLOR}; background-color: {HEADER_B_AUX_BG_COLOR}">{state}</td>"#
            )?;
        }
        write!(self.writer, "</tr>")?;

        if D::DISPLAY_ENTRY {
            let aux = self.dataflow.on_enter(def_id, block_id);
            self.write_row(false, "", "(on entry)", aux)?;
        }

        for (index, statement) in block.statements.iter().enumerate() {
            let aux = self.dataflow.on_statement(def_id, block_id, index);
            self.write_row(false, index, statement, aux)?;
        }

        self.write_row(
            false,
            "T",
            TerminatorHead(&block.terminator.kind),
            iter::repeat_n("", D::COLUMNS.len()),
        )?;

        if D::DISPLAY_ENTRY {
            let aux = self.dataflow.on_exit(def_id, block_id);
            self.write_row(true, "", "(on exit)", aux)?;
        }

        writeln!(self.writer, "</table>")?;
        writeln!(self.writer, "`|")?;

        self.write_terminator(block_id, block)?;

        Ok(())
    }
}

struct BodyRenderOptions {
    highlight: bool,
}

impl<'heap, W, S, D> FormatPart<(DefId, &Body<'heap>, BodyRenderOptions)>
    for D2Format<'_, 'heap, W, S, D>
where
    W: io::Write,
    S: SourceLookup<'heap>,
    D: DataFlowLookup<'heap>,
{
    fn format_part(
        &mut self,
        (def, body, BodyRenderOptions { highlight }): (DefId, &Body<'heap>, BodyRenderOptions),
    ) -> io::Result<()> {
        writeln!(
            self.writer,
            "def{def}:''{{grid-columns:1;grid-gap:0;title:|`md "
        )?;
        self.format_text_unescaped(Signature(
            body,
            SignatureOptions {
                format: RenderFormat::HtmlFragment,
            },
        ))?;
        writeln!(self.writer, "`|;blocks:''{{")?;

        if highlight {
            writeln!(self.writer, r##"style.fill: "#B3D89C""##)?;
        }

        for (id, basic_block) in body.basic_blocks.iter_enumerated() {
            self.format_part((def, id, basic_block))?;
        }

        writeln!(self.writer, "}}}}")?;

        Ok(())
    }
}

impl<'heap, W, S, D> FormatPart<(&DefIdSlice<Body<'heap>>, HighlightBody<'_>)>
    for D2Format<'_, 'heap, W, S, D>
where
    W: io::Write,
    S: SourceLookup<'heap>,
    D: DataFlowLookup<'heap>,
{
    fn format_part(
        &mut self,
        (bodies, highlight): (&DefIdSlice<Body<'heap>>, HighlightBody),
    ) -> io::Result<()> {
        let mut first = true;
        for (def_id, body) in bodies.iter_enumerated() {
            if !first {
                writeln!(self.writer, "\n\n")?;
            }

            let options = BodyRenderOptions {
                highlight: highlight.0.contains(&def_id),
            };

            first = false;
            self.format_part((def_id, body, options))?;
        }

        Ok(())
    }
}
