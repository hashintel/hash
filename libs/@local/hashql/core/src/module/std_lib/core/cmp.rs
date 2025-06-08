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

pub(in crate::module::std_lib) struct Cmp {
    dependencies: PhantomData<()>,
}

impl<'heap> StandardLibraryModule<'heap> for Cmp {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("cmp")
    }

    #[expect(clippy::min_ident_chars, non_snake_case)]
    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        let Number = lib.ty.number();
        let Boolean = lib.ty.boolean();

        let items = [
            (
                "::core::cmp::gt",
                &[">"],
                decl!(lib; <>(lhs: Number, rhs: Number) -> Boolean),
            ),
            (
                "::core::cmp::lt",
                &["<"],
                decl!(lib; <>(lhs: Number, rhs: Number) -> Boolean),
            ),
            (
                "::core::cmp::gte",
                &[">="],
                decl!(lib; <>(lhs: Number, rhs: Number) -> Boolean),
            ),
            (
                "::core::cmp::lte",
                &["<="],
                decl!(lib; <>(lhs: Number, rhs: Number) -> Boolean),
            ),
            (
                "::core::cmp::eq",
                &["=="],
                decl!(lib; <T, U>(lhs: T, rhs: U) -> Boolean),
            ),
            (
                "::core::cmp::ne",
                &["!="],
                decl!(lib; <T, U>(lhs: T, rhs: U) -> Boolean),
            ),
        ];

        for (name, alias, r#type) in items {
            func(lib, &mut def, name, alias, r#type);
        }

        def
    }
}
