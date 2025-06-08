use core::iter;

use crate::{
    heap::Heap,
    module::{
        item::IntrinsicValueItem,
        locals::TypeDef,
        std_lib::{ItemDef, ModuleDef, StandardLibraryContext, StandardLibraryModule},
    },
    symbol::Symbol,
};

pub(crate) struct SpecialForm;

impl SpecialForm {
    fn make<'heap>(
        context: &mut StandardLibraryContext<'_, 'heap>,
        def: &mut ModuleDef<'heap>,

        name: &'static str,
        alias: &[&'static str],
    ) {
        let value = IntrinsicValueItem {
            name,
            r#type: TypeDef {
                id: context.ty.never(),
                arguments: context.ty.env.intern_generic_argument_references(&[]),
            },
        };

        let ident = name.rsplit_once("::").expect("path should be non-empty").1;

        def.push_aliased(
            iter::once(ident)
                .chain(alias.into_iter().copied())
                .map(|name| context.heap.intern_symbol(name)),
            ItemDef::Intrinsic(value.into()),
        );
    }
}

impl<'heap> StandardLibraryModule<'heap> for SpecialForm {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("special_form")
    }

    fn path(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("::kernel::special_form")
    }

    fn define(context: &mut StandardLibraryContext<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        Self::make(context, &mut def, "::kernel::special_form::if", &[]);
        Self::make(context, &mut def, "::kernel::special_form::is", &[]);
        Self::make(context, &mut def, "::kernel::special_form::let", &[]);
        Self::make(context, &mut def, "::kernel::special_form::type", &[]);
        Self::make(context, &mut def, "::kernel::special_form::newtype", &[]);
        Self::make(context, &mut def, "::kernel::special_form::use", &[]);
        Self::make(context, &mut def, "::kernel::special_form::fn", &[]);
        Self::make(context, &mut def, "::kernel::special_form::input", &[]);
        Self::make(context, &mut def, "::kernel::special_form::access", &["."]);
        Self::make(context, &mut def, "::kernel::special_form::index", &["[]"]);

        def
    }
}
