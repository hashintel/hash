use core::alloc::Allocator;

use crate::{
    module::{
        item::IntrinsicValueItem,
        locals::TypeDef,
        std_lib::{ItemDef, ModuleCache, ModuleDef, StandardLibraryContext, StandardLibraryModule},
    },
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) struct SpecialForm;

impl SpecialForm {
    fn make<'heap, S: Allocator>(
        context: &StandardLibraryContext<'_, 'heap, S>,
        def: &mut ModuleDef<'heap, S>,

        path: Symbol<'heap>,
        names: impl IntoIterator<Item = Symbol<'heap>>,
    ) {
        let value = IntrinsicValueItem {
            name: path,
            r#type: TypeDef {
                id: context.ty.never(),
                arguments: context.ty.env.intern_generic_argument_references(&[]),
            },
        };

        def.push_aliased(names, ItemDef::intrinsic(value));
    }
}

impl<'heap> StandardLibraryModule<'heap> for SpecialForm {
    type Children = ();

    fn name() -> Symbol<'heap> {
        sym::special_form
    }

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        _: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        let mut def = ModuleDef::new_in(context.alloc.clone());

        Self::make(context, &mut def, sym::path::r#if, [sym::r#if]);
        Self::make(context, &mut def, sym::path::r#as, [sym::r#as]);
        Self::make(context, &mut def, sym::path::r#let, [sym::r#let]);
        Self::make(context, &mut def, sym::path::r#type, [sym::r#type]);
        Self::make(context, &mut def, sym::path::newtype, [sym::newtype]);
        Self::make(context, &mut def, sym::path::r#use, [sym::r#use]);
        Self::make(context, &mut def, sym::path::r#fn, [sym::r#fn]);
        Self::make(context, &mut def, sym::path::input, [sym::input]);
        Self::make(
            context,
            &mut def,
            sym::path::access,
            [sym::access, sym::symbol::dot],
        );
        Self::make(
            context,
            &mut def,
            sym::path::index,
            [sym::index, sym::symbol::brackets],
        );

        def
    }
}
