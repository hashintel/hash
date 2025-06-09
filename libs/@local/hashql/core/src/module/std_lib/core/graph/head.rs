use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        locals::TypeDef,
        std_lib::{self, ModuleDef, StandardLibraryModule, core::func, decl},
    },
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct Head {
    _dependencies: (
        std_lib::core::graph::Graph,
        std_lib::core::graph::types::knowledge::entity::Entity,
    ),
}

impl<'heap> StandardLibraryModule<'heap> for Head {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("head")
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();
        let heap = lib.heap;

        let graph = lib.manifest::<std_lib::core::graph::Graph>();

        let time_axis_ty = graph.expect_newtype(heap.intern_symbol("TimeAxis"));
        let mut graph_ty = graph.expect_type(heap.intern_symbol("Graph"));
        graph_ty.instantiate(&mut lib.instantiate);

        let mut entity = lib
            .manifest::<std_lib::core::graph::types::knowledge::entity::Entity>()
            .expect_newtype(heap.intern_symbol("Entity"));
        entity.instantiate(&mut lib.instantiate);

        // ::core::graph::head::entities(axis: TimeAxis) -> Graph<Entity<?>>;
        let entities_returns = lib.ty.apply(
            [(
                graph_ty.arguments[0].id,
                lib.ty
                    .apply([(entity.arguments[0].id, lib.ty.unknown())], entity.id),
            )],
            graph_ty.id,
        );
        func(
            lib,
            &mut def,
            "::core::graph::head::entities",
            &[],
            decl!(lib; <>(axis: time_axis_ty.id) -> entities_returns),
        );

        def
    }
}
