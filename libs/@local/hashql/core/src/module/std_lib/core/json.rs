use core::alloc::Allocator;

use crate::{
    module::std_lib::{
        ItemDef, ModuleCache, ModuleDef, StandardLibraryContext, StandardLibraryModule,
    },
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) struct Json {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Json {
    type Children = ();

    fn name() -> Symbol<'heap> {
        sym::json
    }

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        _: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        let mut def = ModuleDef::new_in(context.alloc.clone());

        // type JsonPathSegment = String | Integer;
        // Note: The type should be Natural instead, but this requires refinement types
        let json_path_segment_ty = context
            .ty
            .union([context.ty.string(), context.ty.integer()]);
        def.push(
            sym::JsonPathSegment,
            ItemDef::r#type(context.ty.env, json_path_segment_ty, &[]),
        );

        // type JsonPath = JsonPathSegment[];
        let json_path_ty = context.ty.list(json_path_segment_ty);
        def.push(
            sym::JsonPath,
            ItemDef::r#type(context.ty.env, json_path_ty, &[]),
        );

        def
    }
}
