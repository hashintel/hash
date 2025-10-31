use std::io;

use crate::{
    body::{Body, Source},
    def::{DefId, DefIdSlice},
};

mod text;

pub use text::TextFormat;

pub trait SourceLookup<'heap> {
    fn source(&self, def: DefId) -> Option<Source<'heap>>;
}

impl<'heap> SourceLookup<'heap> for &DefIdSlice<Body<'heap>> {
    fn source(&self, def: DefId) -> Option<Source<'heap>> {
        self.get(def).map(|body| body.source)
    }
}

pub(crate) trait FormatPart<V> {
    fn format_part(&mut self, value: V) -> io::Result<()>;
}
