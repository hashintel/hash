use core::{
    fmt::{self, Display},
    iter,
};
use std::io;

use super::{DataFlowLookup, FormatPart, SourceLookup, TextFormat};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlock, BasicBlockId},
        terminator::{Branch, Goto, GraphRead, TerminatorKind},
    },
    def::{DefId, DefIdSlice},
    pretty::text::{Signature, TargetParams, TerminatorHead},
};

pub struct D2Format<W, S, D> {
    pub writer: W,
    pub sources: S,
    pub dataflow: D,
}

impl<W, S, D> D2Format<W, S, D>
where
    W: io::Write,
{
    pub fn format<'heap>(&mut self, bodies: &DefIdSlice<Body<'heap>>) -> io::Result<()>
    where
        S: SourceLookup<'heap>,
        D: DataFlowLookup<'heap>,
    {
        self.format_part(bodies)
    }

    fn format_text<V>(&mut self, value: V) -> io::Result<()>
    where
        for<'a> TextFormat<&'a mut W, &'a S>: FormatPart<V>,
    {
        TextFormat {
            writer: &mut self.writer,
            indent: 0,
            sources: &self.sources,
        }
        .format_part(value)
    }

    fn write_row<V>(
        &mut self,
        valign_bottom: bool,
        index: impl Display,
        part: V,
        aux: impl IntoIterator<Item: Display>,
    ) -> io::Result<()>
    where
        for<'a> TextFormat<&'a mut W, &'a S>: FormatPart<V>,
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

    fn write_terminator<'heap>(
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
            TerminatorKind::Branch(Branch {
                test: _,
                then,
                r#else,
            }) => {
                write!(
                    self.writer,
                    "{} -> {}: {{ source-arrowhead.label: 1; label: '",
                    BasicBlockName(block_id),
                    BasicBlockName(then.block)
                )?;
                self.format_text(TargetParams(then.args))?;
                writeln!(self.writer, "' }}")?;

                write!(
                    self.writer,
                    "{} -> {}: {{ source-arrowhead.label: 0; label: '",
                    BasicBlockName(block_id),
                    BasicBlockName(r#else.block)
                )?;
                self.format_text(TargetParams(r#else.args))?;
                writeln!(self.writer, "'; style.stroke-dash: 3 }}")?;
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
const HEADER_A_BB_FG_COLOR: &str = "#000";
const HEADER_A_AUX_BG_COLOR: &str = "#F18805";
const HEADER_A_AUX_FG_COLOR: &str = "#FFF";
const HEADER_B_MIR_BG_COLOR: &str = "#C2CAE8";
const HEADER_B_MIR_FG_COLOR: &str = "#FFF";
const HEADER_B_AUX_BG_COLOR: &str = "#F0A202";
const HEADER_B_AUX_FG_COLOR: &str = "#FFF";

struct BasicBlockName(BasicBlockId);
impl fmt::Display for BasicBlockName {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "bb{}", self.0)
    }
}

/// Generate a HTML table for use inside of D2.
///
/// Depending on the amount of auxiliary columns, we differentiate between three different designs.
///
/// If there are no auxiliary columns:
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
/// If there is one auxiliary column:
/// ``` text
///   ┌──────────────────────────────────────────┐
/// A │                   bb0                    │
///   ├────────────────────────────┬─────────────┤
/// B │            MIR             │     AUX     │
///   ├─┬──────────────────────────┼─────────────┤
///   │ │                          │             │
///   └─┴──────────────────────────┴─────────────┘
/// ```
///
/// If there are multiple auxiliary columns:
/// ```text
///   ┌────────────────────────────┬─────────────┐
/// A │            bb0             │    STATE    │
///   ├────────────────────────────┼──────┬──────┤
/// B │            MIR             │ AUX1 │ AUX2 │
///   ├─┬──────────────────────────┼──────┼──────┤
///   │ │                          │      │      │
///   └─┴──────────────────────────┴──────┴──────┘
/// ```
impl<'heap, W, S, D> FormatPart<(DefId, BasicBlockId, &BasicBlock<'heap>)> for D2Format<W, S, D>
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

            write!(self.writer, "{param}")?;
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

impl<'heap, W, S, D> FormatPart<(DefId, &Body<'heap>)> for D2Format<W, S, D>
where
    W: io::Write,
    S: SourceLookup<'heap>,
    D: DataFlowLookup<'heap>,
{
    fn format_part(&mut self, (def, body): (DefId, &Body<'heap>)) -> io::Result<()> {
        write!(self.writer, "def{def}: '")?;
        self.format_text(Signature(body))?;
        writeln!(self.writer, "' {{")?;

        for (id, basic_block) in body.basic_blocks.iter_enumerated() {
            self.format_part((def, id, basic_block))?;
        }

        writeln!(self.writer, "}}")?;

        Ok(())
    }
}

impl<'heap, W, S, D> FormatPart<&DefIdSlice<Body<'heap>>> for D2Format<W, S, D>
where
    W: io::Write,
    S: SourceLookup<'heap>,
    D: DataFlowLookup<'heap>,
{
    fn format_part(&mut self, value: &DefIdSlice<Body<'heap>>) -> io::Result<()> {
        let mut first = true;
        for (def_id, body) in value.iter_enumerated() {
            if !first {
                writeln!(self.writer, "\n\n")?;
            }

            first = false;
            self.format_part((def_id, body))?;
        }

        Ok(())
    }
}
