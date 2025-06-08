use core::marker::PhantomData;

use super::func;
use crate::{
    heap::Heap,
    module::{
        locals::TypeDef,
        std_lib::{ModuleDef, StandardLibrary, StandardLibraryModule, decl},
    },
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct Bool {
    dependencies: PhantomData<()>,
}

impl<'heap> StandardLibraryModule<'heap> for Bool {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("bool")
    }

    #[expect(non_snake_case)]
    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        let Boolean = lib.ty.boolean();

        let items = [
            (
                "::core::bool::not",
                &["!"],
                decl!(lib; <>(value: Boolean) -> Boolean),
            ),
            (
                "::core::bool::and",
                &["&&"],
                decl!(lib; <>(lhs: Boolean, rhs: Boolean) -> Boolean),
            ),
            (
                "::core::bool::or",
                &["||"],
                decl!(lib; <>(lhs: Boolean, rhs: Boolean) -> Boolean),
            ),
        ];

        for (name, alias, r#type) in items {
            func(lib, &mut def, name, alias, r#type);
        }

        def
    }
}
