use crate::{
    module::{
        item::IntrinsicTypeItem,
        std_lib::{ItemDef, ModuleDef, StandardLibrary, StandardLibraryModule},
    },
    symbol::{Symbol, sym},
    r#type::TypeId,
};

pub(in crate::module::std_lib) struct Type;

impl Type {
    fn primitive<'heap>(
        lib: &StandardLibrary<'_, 'heap>,
        def: &mut ModuleDef<'heap>,
        name: Symbol<'heap>,
        id: TypeId,
    ) -> usize {
        let item = ItemDef::r#type(lib.ty.env, id, &[]);
        def.push(name, item)
    }

    fn intrinsic<'heap>(
        def: &mut ModuleDef<'heap>,
        path: Symbol<'heap>,
        ident: Symbol<'heap>,
    ) -> usize {
        let item = ItemDef::intrinsic(IntrinsicTypeItem { name: path });

        def.push(ident, item)
    }
}

impl<'heap> StandardLibraryModule<'heap> for Type {
    type Children = ();

    fn name() -> Symbol<'heap> {
        sym::r#type
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        Self::primitive(lib, &mut def, sym::Boolean, lib.ty.boolean());
        Self::primitive(lib, &mut def, sym::Null, lib.ty.null());
        Self::primitive(lib, &mut def, sym::Number, lib.ty.number());
        Self::primitive(lib, &mut def, sym::Integer, lib.ty.integer());
        // Natural does not yet exist, due to lack of support for refinements
        Self::primitive(lib, &mut def, sym::String, lib.ty.string());

        let unknown = Self::primitive(lib, &mut def, sym::Unknown, lib.ty.unknown());
        def.alias(unknown, sym::symbol::question_mark);

        let never = Self::primitive(lib, &mut def, sym::Never, lib.ty.never());
        def.alias(never, sym::symbol::exclamation);

        // Struct/Tuple are purposefully excluded, as they are
        // fundamental types and do not have any meaningful value constructors.
        // Union and Intersections are also excluded, as they have explicit constructors
        Self::intrinsic(&mut def, sym::path::List, sym::List);
        Self::intrinsic(&mut def, sym::path::Dict, sym::Dict);

        // Union and Intersection are both type intrinsics with an alias, they are only used during
        // special form desurgaring.
        let index = Self::intrinsic(&mut def, sym::path::Union, sym::Union);
        def.alias(index, sym::symbol::pipe);
        let index = Self::intrinsic(&mut def, sym::path::Intersection, sym::Intersection);
        def.alias(index, sym::symbol::ampersand);

        def
    }
}
