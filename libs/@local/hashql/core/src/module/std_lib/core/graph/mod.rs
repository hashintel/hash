pub(in crate::module::std_lib) mod knowledge;
pub(in crate::module::std_lib) mod ontology;
pub(in crate::module::std_lib) mod principal;

use core::marker::PhantomData;

use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        std_lib::{ModuleDef, StandardLibraryModule},
    },
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct Graph {
    dependencies: PhantomData<()>,
}

impl<'heap> StandardLibraryModule<'heap> for Graph {
    type Children = (
        self::knowledge::Knowledge,
        self::ontology::Ontology,
        self::principal::Principal,
    );

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("graph")
    }

    fn define(_: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        ModuleDef::new()
    }
}
