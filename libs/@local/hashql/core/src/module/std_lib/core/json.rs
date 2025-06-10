use crate::{
    heap::Heap,
    module::std_lib::{ItemDef, ModuleDef, StandardLibrary, StandardLibraryModule},
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct Json {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Json {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("json")
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();
        let heap = lib.heap;

        // type JsonPathSegment = String | Integer;
        // Note: The type should be Natural instead, but this requires refinement types
        let json_path_segment_ty = lib.ty.union([lib.ty.string(), lib.ty.integer()]);
        def.push(
            heap.intern_symbol("JsonPathSegment"),
            ItemDef::r#type(lib.ty.env, json_path_segment_ty, &[]),
        );

        // type JsonPath = JsonPathSegment[];
        let json_path_ty = lib.ty.list(json_path_segment_ty);
        def.push(
            heap.intern_symbol("JsonPath"),
            ItemDef::r#type(lib.ty.env, json_path_ty, &[]),
        );

        def
    }
}
