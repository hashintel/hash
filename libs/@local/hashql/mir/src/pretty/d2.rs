use core::fmt::Display;
use std::io;

use super::{DataFlowLookup, FormatPart, SourceLookup, TextFormat};
use crate::{
    body::basic_block::{BasicBlock, BasicBlockId},
    def::DefId,
};

pub struct D2Format<W, S, D> {
    pub writer: W,
    pub sources: S,
    pub dataflow: D,
}

impl<'heap, W, S, D> D2Format<W, S, D>
where
    W: io::Write,
{
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
        TextFormat {
            writer: &mut self.writer,
            indent: 0,
            sources: &self.sources,
        }
        .format_part(part)?;
        write!(self.writer, "</td>")?;

        for col in aux {
            write!(self.writer, r#"<td {fmt} align="left">{col}</td>"#)?;
        }

        write!(self.writer, "</tr>")
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
        writeln!(self.writer, "bb{block_id}: |`md")?;

        self.writer.write_all(
            br#"<table border="1" cellborder="1" cellspacing="0" cellpadding="3" sides="rb">"#,
        )?;

        // Generate the header:
        //   +------------------------------------+-------------+
        // A |                bb4                 |    STATE    |
        //   +------------------------------------+------+------+
        // B |                MIR                 |  GEN | KILL |
        //   +-+----------------------------------+------+------+
        //   | |              ...                 |      |      |

        let aux_columns = D::COLUMNS;

        // Header A:
        write!(self.writer, "<tr>")?;
        write!(
            self.writer,
            r#"<td colspan="{len}" style="color: {HEADER_A_BB_FG_COLOR}; background-color: {HEADER_A_BB_BG_COLOR}" sides="tl">bb{block_id}</td>"#,
            len = if aux_columns.len() == 1 { 3 } else { 2 },
        )?;

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

        // TODO: terminator

        if D::DISPLAY_ENTRY {
            let aux = self.dataflow.on_exit(def_id, block_id);
            self.write_row(true, "", "(on exit)", aux)?;
        }

        writeln!(self.writer, "</table>")?;
        self.writer.write_all(b"`|")
    }
}
