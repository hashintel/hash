use crate::{
    heap::Heap,
    module::{
        item::IntrinsicTypeItem,
        locals::TypeDef,
        std_lib::{ItemDef, ModuleDef, StandardLibraryContext, StandardLibraryModule},
    },
    symbol::Symbol,
    r#type::TypeId,
};

pub(crate) struct Type;

impl Type {
    fn primitive<'heap>(
        context: &mut StandardLibraryContext<'_, 'heap>,
        def: &mut ModuleDef<'heap>,
        name: &'static str,
        id: TypeId,
    ) -> usize {
        let item = ItemDef::Type(TypeDef {
            id,
            arguments: context.ty.env.intern_generic_argument_references(&[]),
        });

        def.push(context.heap.intern_symbol(name), item)
    }

    fn intrinsic<'heap>(
        context: &mut StandardLibraryContext<'_, 'heap>,
        def: &mut ModuleDef<'heap>,
        name: &'static str,
    ) -> usize {
        let item = ItemDef::Intrinsic(IntrinsicTypeItem { name }.into());

        let ident = name.rsplit_once("::").expect("path should be non-empty").1;

        def.push(context.heap.intern_symbol(ident), item)
    }
}

impl<'heap> StandardLibraryModule<'heap> for Type {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("type")
    }

    fn path(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("::kernel::type")
    }

    fn define(context: &mut StandardLibraryContext<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        Self::primitive(context, &mut def, "Boolean", context.ty.boolean());
        Self::primitive(context, &mut def, "Null", context.ty.null());
        Self::primitive(context, &mut def, "Number", context.ty.number());
        Self::primitive(context, &mut def, "Integer", context.ty.integer());
        // Natural does not yet exist, due to lack of support for refinements
        Self::primitive(context, &mut def, "String", context.ty.string());

        let unknown = Self::primitive(context, &mut def, "Unknown", context.ty.unknown());
        def.alias(unknown, context.heap.intern_symbol("?"));

        let never = Self::primitive(context, &mut def, "Never", context.ty.never());
        def.alias(never, context.heap.intern_symbol("!"));

        // Struct/Tuple are purposefully excluded, as they are
        // fundamental types and do not have any meaningful value constructors.
        // Union and Intersections are also excluded, as they have explicit constructors
        Self::intrinsic(context, &mut def, "::kernel::type::List");
        Self::intrinsic(context, &mut def, "::kernel::type::Dict");

        def
    }
}
