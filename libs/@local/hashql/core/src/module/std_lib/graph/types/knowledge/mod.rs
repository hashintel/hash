pub(in crate::module::std_lib) mod entity;

use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        std_lib::{ModuleDef, StandardLibraryModule},
    },
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct Knowledge;

impl<'heap> StandardLibraryModule<'heap> for Knowledge {
    type Children = (self::entity::Entity,);

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("knowledge")
    }

    fn define(_: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        ModuleDef::new()
    }
}
