use crate::{
    module::{
        item::IntrinsicValueItem,
        locals::TypeDef,
        std_lib::{ItemDef, ModuleDef, StandardLibrary, StandardLibraryModule},
    },
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) struct SpecialForm;

impl SpecialForm {
    fn make<'heap>(
        lib: &StandardLibrary<'_, 'heap>,
        def: &mut ModuleDef<'heap>,

        path: Symbol<'heap>,
        names: impl IntoIterator<Item = Symbol<'heap>>,
    ) {
        let value = IntrinsicValueItem {
            name: path,
            r#type: TypeDef {
                id: lib.ty.never(),
                arguments: lib.ty.env.intern_generic_argument_references(&[]),
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

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        Self::make(lib, &mut def, sym::path::r#if, [sym::r#if]);
        Self::make(lib, &mut def, sym::path::r#as, [sym::r#as]);
        Self::make(lib, &mut def, sym::path::r#let, [sym::r#let]);
        Self::make(lib, &mut def, sym::path::r#type, [sym::r#type]);
        Self::make(lib, &mut def, sym::path::newtype, [sym::newtype]);
        Self::make(lib, &mut def, sym::path::r#use, [sym::r#use]);
        Self::make(lib, &mut def, sym::path::r#fn, [sym::r#fn]);
        Self::make(lib, &mut def, sym::path::input, [sym::input]);
        Self::make(
            lib,
            &mut def,
            sym::path::access,
            [sym::access, sym::symbol::dot],
        );
        Self::make(
            lib,
            &mut def,
            sym::path::index,
            [sym::index, sym::symbol::brackets],
        );

        def
    }
}
