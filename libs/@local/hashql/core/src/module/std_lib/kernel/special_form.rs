use core::iter;

use crate::{
    heap::Heap,
    module::{
        item::IntrinsicValueItem,
        locals::TypeDef,
        std_lib::{ItemDef, ModuleDef, StandardLibrary, StandardLibraryModule},
    },
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct SpecialForm;

impl SpecialForm {
    fn make<'heap>(
        lib: &StandardLibrary<'_, 'heap>,
        def: &mut ModuleDef<'heap>,

        name: &'static str,
        alias: &[&'static str],
    ) {
        let value = IntrinsicValueItem {
            name,
            r#type: TypeDef {
                id: lib.ty.never(),
                arguments: lib.ty.env.intern_generic_argument_references(&[]),
            },
        };

        let ident = name.rsplit_once("::").expect("path should be non-empty").1;

        def.push_aliased(
            iter::once(ident)
                .chain(alias.iter().copied())
                .map(|name| lib.heap.intern_symbol(name)),
            ItemDef::intrinsic(value),
        );
    }
}

impl<'heap> StandardLibraryModule<'heap> for SpecialForm {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("special_form")
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        Self::make(lib, &mut def, "::kernel::special_form::if", &[]);
        Self::make(lib, &mut def, "::kernel::special_form::as", &[]);
        Self::make(lib, &mut def, "::kernel::special_form::let", &[]);
        Self::make(lib, &mut def, "::kernel::special_form::type", &[]);
        Self::make(lib, &mut def, "::kernel::special_form::newtype", &[]);
        Self::make(lib, &mut def, "::kernel::special_form::use", &[]);
        Self::make(lib, &mut def, "::kernel::special_form::fn", &[]);
        Self::make(lib, &mut def, "::kernel::special_form::input", &[]);
        Self::make(lib, &mut def, "::kernel::special_form::access", &["."]);
        Self::make(lib, &mut def, "::kernel::special_form::index", &["[]"]);

        def
    }
}
