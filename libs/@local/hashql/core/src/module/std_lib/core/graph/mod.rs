pub(in crate::module::std_lib) mod tmp;
pub(in crate::module::std_lib) mod types;

use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        std_lib::{ItemDef, ModuleDef, StandardLibraryModule},
    },
    symbol::Symbol,
    r#type::{TypeId, kind::generic::GenericArgumentId},
};

pub(in crate::module::std_lib) struct Graph {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Graph {
    type Children = (self::types::Types, self::tmp::Tmp);

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("graph")
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        // newtype Graph<T> = (:)
        let t_arg = lib.ty.fresh_argument("T");
        let t_ref = lib.ty.hydrate_argument(t_arg);

        let graph_ty = lib.ty.generic(
            [t_arg],
            lib.ty.opaque(
                "::core::graph::Graph",
                lib.ty.r#struct([] as [(&str, TypeId); 0]),
            ),
        );
        def.push(
            lib.heap.intern_symbol("Graph"),
            // We don't push `newtype`, but `type` as the `Graph` is not purposefully constructible
            // by the user
            ItemDef::r#type(lib.ty.env, graph_ty, &[t_ref]),
        );

        // newtype TimeAxis = (:)
        // ^ this will change in the future to be a constructible type
        //   see: https://linear.app/hash/issue/H-4736/hashql-make-time-axis-constructible
        let time_axis_ty = lib.ty.generic(
            [] as [GenericArgumentId; 0],
            lib.ty.opaque(
                "::core::graph::TimeAxis",
                lib.ty.r#struct([] as [(&str, TypeId); 0]),
            ),
        );
        def.push(
            lib.heap.intern_symbol("TimeAxis"),
            // We don't push `newtype`, but `type` as the `TimeAxis` is not constructible
            ItemDef::r#type(lib.ty.env, time_axis_ty, &[]),
        );

        def
    }
}
