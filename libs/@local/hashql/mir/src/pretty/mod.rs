use core::{fmt::Display, iter};
use std::io;

use crate::{
    body::{Body, Source, basic_block::BasicBlockId},
    def::{DefId, DefIdSlice},
};

mod d2;
mod text;

pub use d2::D2Format;
pub use text::TextFormat;

pub trait SourceLookup<'heap> {
    fn source(&self, def: DefId) -> Option<Source<'heap>>;
}

impl<'heap, T> SourceLookup<'heap> for &T
where
    T: SourceLookup<'heap>,
{
    fn source(&self, def: DefId) -> Option<Source<'heap>> {
        T::source(self, def)
    }
}

impl<'heap> SourceLookup<'heap> for &DefIdSlice<Body<'heap>> {
    fn source(&self, def: DefId) -> Option<Source<'heap>> {
        self.get(def).map(|body| body.source)
    }
}

pub trait DataFlowLookup<'heap> {
    const COLUMNS: &'static [&'static str];
    const DISPLAY_ENTRY: bool = false;

    fn on_enter(
        &self,
        def: DefId,
        block: BasicBlockId,
    ) -> impl IntoIterator<Item: Display> + use<'heap, Self>;
    fn on_exit(
        &self,
        def: DefId,
        block: BasicBlockId,
    ) -> impl IntoIterator<Item: Display> + use<'heap, Self>;

    fn on_statement(
        &self,
        def: DefId,
        block: BasicBlockId,
        statement: usize,
    ) -> impl IntoIterator<Item: Display> + use<'heap, Self>;
}

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
