use crate::{
    module::{
        StandardLibrary,
        locals::TypeDef,
        std_lib::{self, ModuleDef, StandardLibraryModule, core::func},
    },
    symbol::{Symbol, sym},
    r#type::TypeId,
};

pub(in crate::module::std_lib) struct Tmp {
    _dependencies: (std_lib::graph::temporal::Temporal,),
}

impl<'heap> StandardLibraryModule<'heap> for Tmp {
    type Children = ();

    fn name() -> Symbol<'heap> {
        sym::tmp
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        let query_temporal_axes_ty = lib
            .manifest::<std_lib::graph::temporal::Temporal>()
            .expect_type(sym::QueryTemporalAxes);

        // ::graph::tmp::decision_time_now() -> TimeAxis
        func(
            &mut def,
            sym::path::graph::tmp::decision_time_now,
            [sym::decision_time_now],
            TypeDef {
                id: lib.ty.closure([] as [TypeId; 0], query_temporal_axes_ty.id),
                arguments: lib.ty.env.intern_generic_argument_references(&[]),
            },
        );

        def
    }
}
