mod core;
mod graph;
mod kernel;

use ::core::iter;

use super::{ModuleId, ModuleRegistry, item::IntrinsicItem, locals::TypeDef};
use crate::{
    collections::SmallVec,
    heap::Heap,
    module::{
        PartialModule,
        item::{ConstructorItem, Item, ItemKind},
    },
    symbol::Symbol,
    r#type::{
        TypeBuilder, TypeId,
        environment::{Environment, instantiate::InstantiateEnvironment},
        kind::generic::GenericArgumentReference,
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
enum ItemDef<'heap> {
    Newtype(TypeDef<'heap>),
    Type(TypeDef<'heap>),
    Intrinsic(IntrinsicItem<'heap>),
}

impl<'heap> ItemDef<'heap> {
    fn newtype(
        env: &Environment<'heap>,
        id: TypeId,
        arguments: &[GenericArgumentReference<'heap>],
    ) -> Self {
        Self::Newtype(TypeDef {
            id,
            arguments: env.intern_generic_argument_references(arguments),
        })
    }

    fn r#type(
        env: &Environment<'heap>,
        id: TypeId,
        arguments: &[GenericArgumentReference<'heap>],
    ) -> Self {
        Self::Type(TypeDef {
            id,
            arguments: env.intern_generic_argument_references(arguments),
        })
    }

    fn intrinsic(intrinsic: impl Into<IntrinsicItem<'heap>>) -> Self {
        Self::Intrinsic(intrinsic.into())
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
struct ModuleEntry<'heap> {
    name: Symbol<'heap>,
    def: ItemDef<'heap>,
}

impl<'heap> ModuleEntry<'heap> {
    const fn new(name: Symbol<'heap>, kind: ItemDef<'heap>) -> Self {
        Self { name, def: kind }
    }

    const fn alias(self, alias: Symbol<'heap>) -> Self {
        Self {
            name: alias,
            def: self.def,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct ModuleDef<'heap>(SmallVec<ModuleEntry<'heap>>);

impl<'heap> ModuleDef<'heap> {
    const fn new() -> Self {
        Self(SmallVec::new())
    }

    fn push(&mut self, name: Symbol<'heap>, def: ItemDef<'heap>) -> usize {
        let index = self.0.len();
        self.0.push(ModuleEntry::new(name, def));
        index
    }

    // with gen-blocks we'd be able to return an iterator over the indices for free
    fn push_aliased(
        &mut self,
        names: impl IntoIterator<Item = Symbol<'heap>>,
        def: ItemDef<'heap>,
    ) {
        let names = names.into_iter();

        self.0.reserve(names.size_hint().0);

        for name in names {
            self.push(name, def);
        }
    }

    fn alias(&mut self, index: usize, alias: Symbol<'heap>) -> usize {
        let item = self.0[index].alias(alias);

        let index = self.0.len();
        self.0.push(item);
        index
    }

    fn find(&self, name: Symbol<'heap>) -> Option<ModuleEntry<'heap>> {
        self.0.iter().find(|item| item.name == name).copied()
    }

    #[track_caller]
    fn expect(&self, name: Symbol<'heap>) -> ModuleEntry<'heap> {
        self.find(name).expect("module item not found")
    }

    #[track_caller]
    fn expect_type(&self, name: Symbol<'heap>) -> TypeDef<'heap> {
        match self.expect(name).def {
            ItemDef::Type(type_def) => type_def,
            ItemDef::Newtype(_) | ItemDef::Intrinsic(_) => panic!("expected type definition"),
        }
    }

    #[track_caller]
    fn expect_newtype(&self, name: Symbol<'heap>) -> TypeDef<'heap> {
        match self.expect(name).def {
            ItemDef::Newtype(newtype_def) => newtype_def,
            ItemDef::Type(_) | ItemDef::Intrinsic(_) => panic!("expected newtype definition"),
        }
    }
}

pub(super) struct StandardLibrary<'env, 'heap> {
    heap: &'heap Heap,
    instantiate: InstantiateEnvironment<'env, 'heap>,
    registry: &'env ModuleRegistry<'heap>,
    ty: TypeBuilder<'env, 'heap>,
    modules: SmallVec<(::core::any::TypeId, ModuleDef<'heap>)>,
}

impl<'env, 'heap> StandardLibrary<'env, 'heap> {
    pub(super) fn new(
        environment: &'env Environment<'heap>,
        registry: &'env ModuleRegistry<'heap>,
    ) -> Self {
        Self {
            heap: environment.heap,
            instantiate: InstantiateEnvironment::new(environment),
            registry,
            ty: TypeBuilder::synthetic(environment),
            modules: SmallVec::new(),
        }
    }

    fn define_cached<M>(&mut self) -> usize
    where
        M: StandardLibraryModule<'heap>,
    {
        let module_id = ::core::any::TypeId::of::<M>();
        if let Some(position) = self.modules.iter().position(|&(id, _)| id == module_id) {
            position
        } else {
            let contents = M::define(self);

            let position = self.modules.len();
            self.modules.push((module_id, contents));

            position
        }
    }

    fn manifest<M>(&mut self) -> &ModuleDef<'heap>
    where
        M: StandardLibraryModule<'heap>,
    {
        let index = self.define_cached::<M>();

        &self.modules[index].1
    }

    fn build<M>(&mut self, parent: ModuleId) -> ModuleId
    where
        M: StandardLibraryModule<'heap>,
    {
        self.registry.intern_module(|id| {
            let items = &self.manifest::<M>().0;

            let mut output = SmallVec::with_capacity(items.capacity() + M::Children::LENGTH);

            for &ModuleEntry { name, def: kind } in items {
                let items = match kind {
                    ItemDef::Intrinsic(intrinsic) => [Some(ItemKind::Intrinsic(intrinsic)), None],
                    ItemDef::Type(def) => [Some(ItemKind::Type(def)), None],
                    ItemDef::Newtype(def) => [
                        Some(ItemKind::Constructor(ConstructorItem { r#type: def })),
                        Some(ItemKind::Type(def)),
                    ],
                };

                for kind in items.into_iter().flatten() {
                    output.push(Item {
                        module: id.value(),
                        name,
                        kind,
                    });
                }
            }

            // create all the child modules
            let children_names = M::Children::names(self.heap);
            let children_modules = M::Children::modules(self, id.value());

            for (name, module) in children_names.into_iter().zip(children_modules) {
                output.push(Item {
                    module: id.value(),
                    name,
                    kind: ItemKind::Module(module),
                });
            }

            PartialModule {
                name: M::name(self.heap),
                parent,
                items: self.registry.intern_items(&output),
            }
        })
    }

    pub(super) fn register(&mut self) {
        type Root = (self::core::Core, self::kernel::Kernel, self::graph::Graph);

        let roots: smallvec::SmallVec<_, 3> =
            Root::modules(self, ModuleId::ROOT).into_iter().collect();

        for id in roots {
            self.registry.register(id);
        }
    }
}

trait Submodules<'heap> {
    const LENGTH: usize;

    fn names(heap: &'heap Heap) -> impl IntoIterator<Item = Symbol<'heap>>;

    fn modules(
        lib: &mut StandardLibrary<'_, 'heap>,
        parent: ModuleId,
    ) -> impl IntoIterator<Item = ModuleId>;
}

impl<'heap> Submodules<'heap> for () {
    const LENGTH: usize = 0;

    fn names(_: &'heap Heap) -> impl IntoIterator<Item = Symbol<'heap>> {
        iter::empty()
    }

    fn modules(
        _: &mut StandardLibrary<'_, 'heap>,
        _: ModuleId,
    ) -> impl IntoIterator<Item = ModuleId> {
        iter::empty()
    }
}

macro_rules! impl_submodules {
    ($($item:ident),*) => {
        impl_submodules!(@expand @(); $($item),*);
    };

    (@expand @($($preceding:ident)*);) => {};

    (@expand @($($preceding:ident)*); $item:ident $(, $rest:ident)*) => {
        impl_submodules!(@expand @($($preceding)* $item); $($rest),*);
        impl_submodules!(@impl; $($preceding)* $item);
    };

    (@impl; $($item:ident)*) => {
        #[expect(non_snake_case, clippy::min_ident_chars)]
        impl<'heap, $($item),*> Submodules<'heap> for ($($item,)*)
        where
            $($item: StandardLibraryModule<'heap>,)*
        {
            const LENGTH: usize = ${count($item)};

            fn names(heap: &'heap Heap) -> impl IntoIterator<Item = Symbol<'heap>> {
                $(let $item = $item::name(heap);)*

                [$($item),*]
            }

            fn modules(
                lib: &mut StandardLibrary<'_, 'heap>,
                parent: ModuleId,
            ) -> impl IntoIterator<Item = ModuleId> {
                $(let $item = lib.build::<$item>(parent);)*

                [$($item),*]
            }
        }
    };
}

impl_submodules!(A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P);

trait StandardLibraryModule<'heap>: 'static {
    type Children: Submodules<'heap>;

    fn name(heap: &'heap Heap) -> Symbol<'heap>;

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap>;
}

/// Declares a generic function type with parameters and return type.
///
/// Syntax: `<generics>(params) -> return_type`:
/// - `generics`: Optional generic type parameters with optional bounds.
/// - `params`: Function parameters with their type bounds.
/// - `return_type`: The return type expression.
///
/// Creates a closure type that can be generic if type parameters are specified.
macro_rules! decl {
    ($lib:ident; <$($generic:ident $(: $generic_bound:ident)?),*>($($param:ident: $param_bound:expr),*) -> $return:expr) => {{
        $(
            #[expect(non_snake_case)]
            let ${concat($generic, _arg)} = $lib.ty.fresh_argument(stringify!($generic));
        )*

        $(
            #[expect(non_snake_case)]
            let ${concat($generic, _ref)} = $lib.ty.hydrate_argument(${concat($generic, _arg)});
            #[expect(non_snake_case, clippy::min_ident_chars)]
            let $generic = $lib.ty.param(${concat($generic, _arg)});
        )*

        let mut closure = $lib.ty.closure([$($param_bound),*], $return);
        if ${count($generic)} > 0 {
            closure = $lib.ty.generic([
                $(
                    (${concat($generic, _arg)}, None $(.or(Some($generic_bound)))?)
                ),*
            ] as [(crate::r#type::kind::generic::GenericArgumentId, Option<crate::r#type::TypeId>); ${count($generic)}], closure)
        }

        TypeDef {
            id: closure,
            arguments: $lib.ty.env.intern_generic_argument_references(&[$(${concat($generic, _ref)}),*]),
        }
    }};
}

pub(in crate::module::std_lib) use decl;
