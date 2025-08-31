use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        locals::TypeDef,
        std_lib::{self, ModuleDef, StandardLibraryModule, core::func},
    },
    symbol::Symbol,
    r#type::TypeId,
};

pub(in crate::module::std_lib) struct Tmp {
    _dependencies: (std_lib::graph::Graph,),
}

impl<'heap> StandardLibraryModule<'heap> for Tmp {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("tmp")
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();
        let heap = lib.heap;

        let query_temporal_axes_ty = lib
            .manifest::<std_lib::graph::Graph>()
            .expect_type(heap.intern_symbol("QueryTemporalAxes"));

        // ::graph::tmp::decision_time_now() -> TimeAxis
        func(
            lib,
            &mut def,
            "::graph::tmp::decision_time_now",
            &[],
            TypeDef {
                id: lib.ty.closure([] as [TypeId; 0], query_temporal_axes_ty.id),
                arguments: lib.ty.env.intern_generic_argument_references(&[]),
            },
        );

        def
    }
}
