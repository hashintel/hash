use crate::{
    heap::Heap,
    module::{
        item::IntrinsicTypeItem,
        std_lib::{ItemDef, ModuleDef, StandardLibrary, StandardLibraryModule},
    },
    symbol::Symbol,
    r#type::TypeId,
};

pub(in crate::module::std_lib) struct Type;

impl Type {
    fn primitive<'heap>(
        lib: &StandardLibrary<'_, 'heap>,
        def: &mut ModuleDef<'heap>,
        name: &'static str,
        id: TypeId,
    ) -> usize {
        let item = ItemDef::r#type(lib.ty.env, id, &[]);
        def.push(lib.heap.intern_symbol(name), item)
    }

    fn intrinsic<'heap>(
        lib: &StandardLibrary<'_, 'heap>,
        def: &mut ModuleDef<'heap>,
        name: &'static str,
    ) -> usize {
        let item = ItemDef::intrinsic(IntrinsicTypeItem { name });

        let ident = name.rsplit_once("::").expect("path should be non-empty").1;

        def.push(lib.heap.intern_symbol(ident), item)
    }
}

impl<'heap> StandardLibraryModule<'heap> for Type {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("type")
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        Self::primitive(lib, &mut def, "Boolean", lib.ty.boolean());
        Self::primitive(lib, &mut def, "Null", lib.ty.null());
        Self::primitive(lib, &mut def, "Number", lib.ty.number());
        Self::primitive(lib, &mut def, "Integer", lib.ty.integer());
        // Natural does not yet exist, due to lack of support for refinements
        Self::primitive(lib, &mut def, "String", lib.ty.string());

        let unknown = Self::primitive(lib, &mut def, "Unknown", lib.ty.unknown());
        def.alias(unknown, lib.heap.intern_symbol("?"));

        let never = Self::primitive(lib, &mut def, "Never", lib.ty.never());
        def.alias(never, lib.heap.intern_symbol("!"));

        // Struct/Tuple are purposefully excluded, as they are
        // fundamental types and do not have any meaningful value constructors.
        // Union and Intersections are also excluded, as they have explicit constructors
        Self::intrinsic(lib, &mut def, "::kernel::type::List");
        Self::intrinsic(lib, &mut def, "::kernel::type::Dict");

        def
    }
}
