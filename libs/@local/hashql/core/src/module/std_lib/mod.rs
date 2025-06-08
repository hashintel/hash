mod kernel;

use super::{ModuleId, ModuleRegistry, item::IntrinsicItem, locals::TypeDef};
use crate::{
    collection::SmallVec,
    heap::Heap,
    intern::Provisioned,
    module::{
        PartialModule,
        item::{ConstructorItem, Item, ItemKind},
    },
    symbol::Symbol,
    r#type::{TypeBuilder, environment::Environment},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
enum ItemDef<'heap> {
    Newtype(TypeDef<'heap>),
    Type(TypeDef<'heap>),
    Intrinsic(IntrinsicItem<'heap>),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
struct ModuleEntry<'heap> {
    pub name: Symbol<'heap>,
    pub kind: ItemDef<'heap>,
}

impl<'heap> ModuleEntry<'heap> {
    pub fn new(name: Symbol<'heap>, kind: ItemDef<'heap>) -> Self {
        Self { name, kind }
    }

    pub fn alias(self, alias: Symbol<'heap>) -> Self {
        Self {
            name: alias,
            kind: self.kind,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct ModuleDef<'heap>(SmallVec<ModuleEntry<'heap>>);

impl<'heap> ModuleDef<'heap> {
    fn new() -> Self {
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

    fn expect(&self, name: Symbol<'heap>) -> ModuleEntry<'heap> {
        self.find(name).expect("module item not found")
    }
}

struct StandardLibraryContext<'env, 'heap> {
    heap: &'heap Heap,
    registry: &'env ModuleRegistry<'heap>,
    ty: TypeBuilder<'env, 'heap>,
    modules: SmallVec<(Symbol<'heap>, ModuleDef<'heap>)>,
}

impl<'env, 'heap> StandardLibraryContext<'env, 'heap> {
    fn new(
        heap: &'heap Heap,
        environment: &'env Environment<'heap>,
        registry: &'env ModuleRegistry<'heap>,
    ) -> Self {
        Self {
            heap,
            registry,
            ty: TypeBuilder::synthetic(environment),
            modules: SmallVec::new(),
        }
    }

    fn define_cached<M>(&mut self) -> usize
    where
        M: StandardLibraryModule<'heap>,
    {
        let module_path = M::path(self.heap);
        if let Some(position) = self
            .modules
            .iter()
            .position(|(path, _)| *path == module_path)
        {
            position
        } else {
            let contents = M::define(self);

            let position = self.modules.len();
            self.modules.push((module_path, contents));

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

    fn build<M>(&mut self, parent: Provisioned<ModuleId>) -> ModuleId
    where
        M: StandardLibraryModule<'heap>,
    {
        self.registry.intern_module(|id| {
            let items = &self.manifest::<M>().0;

            let mut output = SmallVec::with_capacity(items.capacity() + M::Children::LENGTH);

            for &ModuleEntry { name, kind } in items {
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
            let children_modules = M::Children::modules(self, id);

            for (name, module) in children_names.into_iter().zip(children_modules) {
                output.push(Item {
                    module: id.value(),
                    name,
                    kind: ItemKind::Module(module),
                });
            }

            PartialModule {
                name: M::name(&self.heap),
                parent: parent.value(),
                items: self.registry.intern_items(&output),
            }
        })
    }
}

trait Submodules<'heap> {
    const LENGTH: usize;

    fn names(heap: &'heap Heap) -> impl IntoIterator<Item = Symbol<'heap>>;

    fn modules(
        context: &mut StandardLibraryContext<'_, 'heap>,
        parent: Provisioned<ModuleId>,
    ) -> impl IntoIterator<Item = ModuleId>;
}

impl<'heap> Submodules<'heap> for () {
    const LENGTH: usize = 0;

    fn names(_: &'heap Heap) -> impl IntoIterator<Item = Symbol<'heap>> {
        core::iter::empty()
    }

    fn modules(
        _: &mut StandardLibraryContext<'_, 'heap>,
        _: Provisioned<ModuleId>,
    ) -> impl IntoIterator<Item = ModuleId> {
        core::iter::empty()
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
        #[expect(non_snake_case)]
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
                context: &mut StandardLibraryContext<'_, 'heap>,
                parent: Provisioned<ModuleId>,
            ) -> impl IntoIterator<Item = ModuleId> {
                $(let $item = context.build::<$item>(parent);)*

                [$($item),*]
            }
        }
    };
}

impl_submodules!(A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P);

trait StandardLibraryModule<'heap> {
    type Children: Submodules<'heap>;

    fn name(heap: &'heap Heap) -> Symbol<'heap>;
    fn path(heap: &'heap Heap) -> Symbol<'heap>;

    fn define(context: &mut StandardLibraryContext<'_, 'heap>) -> ModuleDef<'heap>;
}
