pub(in crate::module::std_lib) mod body;
pub(in crate::module::std_lib) mod entity;
pub(in crate::module::std_lib) mod head;
pub(in crate::module::std_lib) mod tail;
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
    type Children = (
        self::head::Head,
        self::body::Body,
        self::tail::Tail,
        self::entity::Entity,
        self::tmp::Tmp,
        self::types::Types,
    );

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("graph")
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        // newtype Graph<T> = ('marker: T)
        //
        // The internal data is intentionally inaccessible to user code. Instead, it's used
        // internally to track the graph's type information. The field is named `'marker` using an
        // identifier that cannot be referenced in user code (`'` is not a valid symbol in any
        // identifier).
        let t_arg = lib.ty.fresh_argument("T");
        let t_ref = lib.ty.hydrate_argument(t_arg);
        let t_param = lib.ty.param(t_arg);

        let graph_ty = lib.ty.generic(
            [t_arg],
            lib.ty
                .opaque("::graph::Graph", lib.ty.r#struct([("'marker", t_param)])),
        );
        def.push(
            lib.heap.intern_symbol("Graph"),
            // Export as `type` rather than `newtype` since Graph is not intended to be
            // user-constructible
            ItemDef::r#type(lib.ty.env, graph_ty, &[t_ref]),
        );

        // newtype TimeAxis = (:)
        //
        // Currently implemented as an empty opaque type. This will be enhanced to support
        // user construction in the future.
        // see: https://linear.app/hash/issue/H-4736/hashql-make-time-axis-constructible
        let time_axis_ty = lib.ty.generic(
            [] as [GenericArgumentId; 0],
            lib.ty.opaque(
                "::graph::TimeAxis",
                lib.ty.r#struct([] as [(&str, TypeId); 0]),
            ),
        );
        def.push(
            lib.heap.intern_symbol("QueryTemporalAxes"),
            // Export as `type` rather than `newtype` since TimeAxis is currently not
            // user-constructible
            ItemDef::r#type(lib.ty.env, time_axis_ty, &[]),
        );

        def
    }
}
