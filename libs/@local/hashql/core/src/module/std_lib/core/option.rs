use crate::{
    heap::Heap,
    module::std_lib::{ItemDef, ModuleDef, StandardLibrary, StandardLibraryModule},
    symbol::Symbol,
};

pub(in crate::module::std_lib) struct Option;

impl<'heap> StandardLibraryModule<'heap> for Option {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("option")
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        // Option is simply a union between two opaque types, when the constructor only takes a
        // `Null` the constructor automatically allows for no-value.
        let t_arg = lib.ty.fresh_argument("T");
        let t_ref = lib.ty.hydrate_argument(t_arg);
        let t_param = lib.ty.param(t_arg);

        // newtype None = Null;
        let none_ty = lib.ty.opaque("::core::option::None", lib.ty.null());
        def.push(
            lib.heap.intern_symbol("None"),
            ItemDef::newtype(lib.ty.env, none_ty, &[]),
        );

        // newtype Some<T> = T;
        let some_ty = lib.ty.generic(
            [(t_arg, None)],
            lib.ty.opaque("::core::option::Some", t_param),
        );
        def.push(
            lib.heap.intern_symbol("Some"),
            ItemDef::newtype(lib.ty.env, some_ty, &[t_ref]),
        );

        // type Option<T> = Some<T> | None;
        let option_ty = lib.ty.union([some_ty, none_ty]);
        def.push(
            lib.heap.intern_symbol("Option"),
            ItemDef::r#type(lib.ty.env, option_ty, &[t_ref]),
        );

        def
    }
}
