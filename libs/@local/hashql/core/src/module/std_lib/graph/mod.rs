pub(in crate::module::std_lib) mod body;
pub(in crate::module::std_lib) mod entity;
pub(in crate::module::std_lib) mod head;
pub(in crate::module::std_lib) mod tail;
pub mod temporal;
pub(in crate::module::std_lib) mod tmp;
pub mod types;

use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        std_lib::{ItemDef, ModuleDef, StandardLibraryModule},
    },
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct Graph {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Graph {
    type Children = (
        self::temporal::Temporal,
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

        def
    }
}
