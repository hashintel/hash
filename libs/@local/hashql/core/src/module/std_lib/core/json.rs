use core::alloc::Allocator;

use self::types::JsonPathDependencies;
use crate::{
    module::std_lib::{
        CacheId, ItemDef, ModuleCache, ModuleDef, StandardLibraryContext, StandardLibraryModule,
    },
    symbol::{Symbol, sym},
};

pub mod types {
    use crate::r#type::{TypeBuilder, TypeId};

    // type JsonPathSegment = String | Integer;
    #[must_use]
    pub fn json_path_segment(ty: &TypeBuilder<'_, '_>) -> TypeId {
        ty.union([ty.string(), ty.integer()])
    }

    pub struct JsonPathDependencies {
        pub json_path_segment: TypeId,
    }

    // type JsonPath = JsonPathSegment[];
    #[must_use]
    pub fn json_path(
        ty: &TypeBuilder<'_, '_>,
        dependencies: Option<JsonPathDependencies>,
    ) -> TypeId {
        ty.list(dependencies.map_or_else(
            || json_path_segment(ty),
            |dependencies| dependencies.json_path_segment,
        ))
    }
}

pub(in crate::module::std_lib) struct Json {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Json {
    type Children = ();

    const CACHE_ID: CacheId = CacheId::CoreJson;

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
        let json_path_segment_ty = self::types::json_path_segment(&context.ty);
        def.push(
            sym::JsonPathSegment,
            ItemDef::r#type(context.ty.env, json_path_segment_ty, &[]),
        );

        // type JsonPath = JsonPathSegment[];
        let json_path_ty = self::types::json_path(
            &context.ty,
            Some(JsonPathDependencies {
                json_path_segment: json_path_segment_ty,
            }),
        );
        def.push(
            sym::JsonPath,
            ItemDef::r#type(context.ty.env, json_path_ty, &[]),
        );

        def
    }
}
