use core::marker::PhantomData;

use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        std_lib::{ItemDef, ModuleDef, StandardLibraryModule},
    },
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct Ontology {
    dependencies: PhantomData<()>,
}

impl<'heap> StandardLibraryModule<'heap> for Ontology {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("ontology")
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        // newtype OntologyTypeVersion = String;
        def.push(
            lib.heap.intern_symbol("OntologyTypeVersion"),
            ItemDef::newtype(
                lib.ty.env,
                lib.ty.opaque(
                    "::core::graph::ontology::OntologyTypeVersion",
                    lib.ty.string(),
                ),
                &[],
            ),
        );

        def
    }
}
