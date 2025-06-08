// This is in a separate module, to facilitate: https://linear.app/hash/issue/H-4735/hashql-convert-rust-types-into-hashql-types
use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        std_lib::{ModuleDef, StandardLibraryModule},
    },
    symbol::Symbol,
};

pub(in crate::module::std_lib) mod knowledge;
pub(in crate::module::std_lib) mod ontology;
pub(in crate::module::std_lib) mod principal;

pub(in crate::module::std_lib) struct TypeSystem {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for TypeSystem {
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
