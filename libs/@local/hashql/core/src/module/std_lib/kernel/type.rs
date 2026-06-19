use core::alloc::Allocator;

use crate::{
    module::{
        item::IntrinsicTypeItem,
        std_lib::{ItemDef, ModuleCache, ModuleDef, StandardLibraryContext, StandardLibraryModule},
    },
    symbol::{Symbol, sym},
    r#type::TypeId,
};

pub(in crate::module::std_lib) struct Type;

impl Type {
    fn primitive<'heap, S: Allocator>(
        context: &StandardLibraryContext<'_, 'heap, S>,
        def: &mut ModuleDef<'heap, S>,
        name: Symbol<'heap>,
        id: TypeId,
    ) -> usize {
        let item = ItemDef::r#type(context.ty.env, id, &[]);
        def.push(name, item)
    }

    fn intrinsic<'heap, S: Allocator>(
        def: &mut ModuleDef<'heap, S>,
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

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        _: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        let mut def = ModuleDef::new_in(context.alloc.clone());

        Self::primitive(context, &mut def, sym::Boolean, context.ty.boolean());
        Self::primitive(context, &mut def, sym::Null, context.ty.null());
        Self::primitive(context, &mut def, sym::Number, context.ty.number());
        Self::primitive(context, &mut def, sym::Integer, context.ty.integer());
        // Natural does not yet exist, due to lack of support for refinements
        Self::primitive(context, &mut def, sym::String, context.ty.string());

        let unknown = Self::primitive(context, &mut def, sym::Unknown, context.ty.unknown());
        def.alias(unknown, sym::symbol::question_mark);

        let never = Self::primitive(context, &mut def, sym::Never, context.ty.never());
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
