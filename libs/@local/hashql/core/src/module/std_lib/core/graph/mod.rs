pub(in crate::module::std_lib) mod types;

use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        std_lib::{ModuleDef, StandardLibraryModule},
    },
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct Graph {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Graph {
    type Children = (self::types::Types,);

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("graph")
    }

    fn define(_: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        ModuleDef::new()
    }
}
