use crate::{
    body::{Body, Source},
    def::{DefId, DefIdSlice},
};

mod text;
mod write;

pub use text::TextFormat;

pub trait SourceLookup<'heap> {
    fn source(&self, def: DefId) -> Option<Source<'heap>>;
}

impl<'heap> SourceLookup<'heap> for &DefIdSlice<Body<'heap>> {
    fn source(&self, def: DefId) -> Option<Source<'heap>> {
        self.get(def).map(|body| body.source)
    }
}
