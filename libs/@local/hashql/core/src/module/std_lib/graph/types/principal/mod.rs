pub(in crate::module::std_lib) mod actor_group;

use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        std_lib::{ModuleDef, StandardLibraryModule},
    },
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct Principal {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Principal {
    type Children = (self::actor_group::ActorGroup,);

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("principal")
    }

    fn define(_: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        ModuleDef::new()
    }
}
