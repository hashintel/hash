// Textual representation of bodies, based on a similar syntax used by rustc

use core::fmt::{Display, Formatter};
use std::{fmt::FormattingOptions, io::Write as _};

use super::PrettyPrinter;
use crate::{
    body::{Body, Source},
    def::DefId,
};

struct PrettyText<'buf> {
    buffer: &'buf mut Vec<u8>,
}

impl PrettyText<'_> {
    fn source<'heap>(&mut self, source: Source<'heap>) {
        match source {
            Source::Ctor(symbol) => {
                let _ = write!(self.buffer, "{{ctor#{symbol}}}");
            }
            Source::Closure(id, binder) => todo!(),
            Source::Thunk(id, binder) => todo!(),
            Source::Intrinsic(def_id) => {
                let _ = write!(self.buffer, "{{intrinsic#{def_id}}}");
            }
        }
    }
}

impl<'buf> PrettyPrinter<'buf> for PrettyText<'buf> {
    fn from_buffer(buffer: &'buf mut Vec<u8>) -> Self {
        Self { buffer }
    }

    fn pretty_body(&mut self, body: &Body) {
        todo!()
    }
}
