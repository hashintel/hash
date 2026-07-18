use core::fmt::Display;
use std::{
    alloc::{Allocator, Global},
    fmt,
};

use super::{
    constraints::{Constraints, EndpointConstraint},
    example::Example,
    group::GroupItem,
    phrase::Phrase,
    prelude::Prelude,
};

struct IndentationWriter<W> {
    writer: W,
    indent: usize,
}

impl<W> IndentationWriter<W> {
    fn new(writer: W, indent: usize) -> Self {
        Self { writer, indent }
    }
}

impl<W: fmt::Write> fmt::Write for IndentationWriter<W> {
    fn write_str(&mut self, s: &str) -> fmt::Result {
        let mut previous = 0;
        for newline in memchr::memchr_iter(b'\n', s.as_bytes()) {
            let line = &s[previous..newline];
            writeln!(self.writer, "{:indent$}{line}", indent = self.indent)?;
            previous = newline + 1;
        }

        let line = &s[previous..];
        writeln!(self.writer, "{:indent$}{line}", indent = self.indent)?;

        Ok(())
    }
}

pub struct CardContents<'text, A: Allocator = Global> {
    pub prelude: Prelude<'text, A>,

    pub ancestors: Vec<Phrase<'text>, A>,

    pub source_types: Vec<Phrase<'text>, A>,
    pub target_types: Vec<Phrase<'text>, A>,

    pub examples: Vec<GroupItem<'text, Example<'text>>, A>,

    pub endpoint_constraints: Vec<EndpointConstraint<'text, A>, A>,
    pub constraints: Constraints,
}

impl<'text> Display for CardContents<'text> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let Self {
            prelude,
            ancestors,
            source_types,
            target_types,
            examples,
            endpoint_constraints,
            constraints,
        } = self;

        writeln!(fmt, "{prelude}")?;
        let mut requires_newline = false;

        if !ancestors.is_empty() {
            requires_newline = true;
            writeln!(fmt, "Ancestors:")?;
            let options = fmt.options();
            let mut writer = IndentationWriter::new(fmt, 2);

            let mut formatter = fmt::Formatter::new(&mut writer, options);
            for ancestor in ancestors {
                writeln!(formatter, "- {ancestor}")?;
            }
        }

        todo!()
    }
}
