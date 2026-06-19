pub mod core;
pub mod graph;
mod kernel;

use ::core::{alloc::Allocator, any, iter, mem::MaybeUninit, num::NonZero};

use super::{ModuleId, ModuleRegistry, item::IntrinsicItem, locals::TypeDef};
use crate::{
    id::{Id as _, bit_vec::DenseBitSet},
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

struct ModuleDef<'heap, S: Allocator>(Vec<ModuleEntry<'heap>, S>);

impl<'heap, S: Allocator> ModuleDef<'heap, S> {
    const fn new_in(alloc: S) -> Self {
        Self(Vec::new_in(alloc))
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

hashql_macros::define_id! {
    #[id(crate = crate)]
    struct CacheId(u8 is 0..=u8::MAX)
}

struct StandardLibraryContext<'env, 'heap, S: Allocator> {
    pub instantiate: InstantiateEnvironment<'env, 'heap>,
    pub registry: &'env ModuleRegistry<'heap>,
    pub ty: TypeBuilder<'env, 'heap>,
    pub alloc: S,
}

struct ModuleCache<'heap, S: Allocator> {
    entries: Box<[MaybeUninit<ModuleDef<'heap, S>>], S>,
    lookup: Box<[any::TypeId], S>,

    occupied: DenseBitSet<CacheId>,
}

#[expect(unsafe_code)]
impl<'heap, S: Allocator> ModuleCache<'heap, S> {
    fn new_in(lookup: Box<[any::TypeId], S>, alloc: S) -> Self
    where
        S: Clone,
    {
        let length = lookup.len();

        Self {
            entries: Box::new_uninit_slice_in(length, alloc),
            lookup,
            occupied: DenseBitSet::new_empty(length),
        }
    }

    fn type_to_cache_id<T: ?Sized + 'static>(&self) -> CacheId {
        self.lookup
            .iter()
            .position(|&id| id == any::TypeId::of::<T>())
            .map_or_else(
                || unreachable!("type not registered in lookup table"),
                CacheId::from_usize,
            )
    }

    fn insert_unique(
        &mut self,
        id: CacheId,
        module: ModuleDef<'heap, S>,
    ) -> &mut ModuleDef<'heap, S> {
        assert!(!self.occupied.contains(id), "cache entry already occupied");

        let value = self.entries[id.as_usize()].write(module);

        // We only insert AFTER the entry has been initialized because otherwise we could drop a
        // value on panic that hasn't been initialized.
        self.occupied.insert(id);

        value
    }

    fn contains(&self, id: CacheId) -> bool {
        self.occupied.contains(id)
    }

    fn request<T: StandardLibraryModule<'heap>>(
        &mut self,
        context: &mut StandardLibraryContext<'_, 'heap, S>,
    ) -> &ModuleDef<'heap, S>
    where
        S: Clone,
    {
        let id = self.type_to_cache_id::<T>();

        if self.contains(id) {
            // SAFETY: contains ensures that the entry is initialized
            return unsafe { self.entries[id.as_usize()].assume_init_ref() };
        }

        let module = T::define(context, self);
        self.insert_unique(id, module)
    }

    fn build<T>(
        &mut self,
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        depth: NonZero<u32>,
        parent: ModuleId,
    ) -> ModuleId
    where
        T: StandardLibraryModule<'heap>,
        S: Clone,
    {
        context.registry.intern_module(|id| {
            let items = &self.request::<T>(context).0;
            let mut output =
                Vec::with_capacity_in(items.len() + T::Children::LENGTH, context.alloc.clone());

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
            let children_names = T::Children::names();
            let children_modules =
                T::Children::modules(context, self, depth.saturating_add(1), id.value());

            for (name, module) in children_names.into_iter().zip(children_modules) {
                output.push(Item {
                    module: id.value(),
                    name,
                    kind: ItemKind::Module(module),
                });
            }

            PartialModule {
                name: T::name(),
                parent,
                depth,
                items: context.registry.intern_items(&output),
            }
        })
    }
}

#[expect(unsafe_code)]
impl<S: Allocator> Drop for ModuleCache<'_, S> {
    fn drop(&mut self) {
        if self.occupied.count() == self.entries.len() {
            // SAFETY: all the elements have been initialized
            unsafe {
                self.entries.assume_init_drop();
            }
        } else {
            for index in &self.occupied {
                // SAFETY: the element has been initialized by the cache
                unsafe {
                    self.entries[index.as_usize()].assume_init_drop();
                }
            }
        }
    }
}

pub(super) struct StandardLibrary<'env, 'heap, S: Allocator> {
    context: StandardLibraryContext<'env, 'heap, S>,
}

impl<'env, 'heap, S: Allocator> StandardLibrary<'env, 'heap, S> {
    pub(super) fn new(
        environment: &'env Environment<'heap>,
        registry: &'env ModuleRegistry<'heap>,
        alloc: S,
    ) -> Self {
        Self {
            context: StandardLibraryContext {
                registry,
                instantiate: InstantiateEnvironment::new(environment),
                ty: TypeBuilder::synthetic(environment),
                alloc,
            },
        }
    }

    #[expect(unsafe_code)]
    pub(super) fn register(&mut self)
    where
        S: Clone,
    {
        type Root = (self::core::Core, self::kernel::Kernel, self::graph::Graph);
        const ONE: NonZero<u32> = NonZero::new(1).unwrap();

        let alloc = self.context.alloc.clone();
        let registry = self.context.registry;

        let count = Root::ITEMS;

        let mut lookup = Box::new_uninit_slice_in(count, alloc.clone());
        lookup.write_filled(any::TypeId::of::<!>());
        // SAFETY: We have just written `count` elements to `lookup`, so it is initialized.
        let mut lookup = unsafe { lookup.assume_init() };

        let mut cursor = 0;

        Root::register(&mut cursor, &mut lookup);
        debug_assert_eq!(cursor, count);

        let mut cache = ModuleCache::new_in(lookup, alloc);
        for module in Root::modules(&mut self.context, &mut cache, ONE, ModuleId::ROOT) {
            registry.register(module);
        }
    }
}

trait Submodules<'heap> {
    const LENGTH: usize;
    const ITEMS: usize;

    fn names() -> impl IntoIterator<Item = Symbol<'heap>>;

    fn register(cursor: &mut usize, items: &mut [any::TypeId]);

    fn modules<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        cache: &mut ModuleCache<'heap, S>,
        depth: NonZero<u32>,
        parent: ModuleId,
    ) -> impl IntoIterator<Item = ModuleId>;
}

impl<'heap> Submodules<'heap> for () {
    const ITEMS: usize = 0;
    const LENGTH: usize = 0;

    fn names() -> impl IntoIterator<Item = Symbol<'heap>> {
        iter::empty()
    }

    fn register(_: &mut usize, _: &mut [any::TypeId]) {}

    fn modules<S: Allocator + Clone>(
        _: &mut StandardLibraryContext<'_, 'heap, S>,
        _: &mut ModuleCache<'heap, S>,
        _: NonZero<u32>,
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
            const ITEMS: usize = ${count($item)} $(+ <$item::Children as Submodules<'heap>>::ITEMS)*;

            fn register(cursor: &mut usize, items: &mut [any::TypeId]) {
                $(
                    items[*cursor] = any::TypeId::of::<$item>();
                    *cursor += 1;

                    <$item::Children as Submodules<'heap>>::register(cursor, items);
                )*
            }

            fn names() -> impl IntoIterator<Item = Symbol<'heap>> {
                $(let $item = $item::name();)*

                [$($item),*]
            }

            fn modules<S: Allocator + Clone>(
                context: &mut StandardLibraryContext<'_, 'heap, S>,
                cache: &mut ModuleCache<'heap, S>,
                depth: NonZero<u32>,
                parent: ModuleId,
            ) -> impl IntoIterator<Item = ModuleId> {
                $(let $item = cache.build::<$item>(context, depth, parent);)*

                [$($item),*]
            }
        }
    };
}

impl_submodules!(A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P);

trait StandardLibraryModule<'heap>: 'static {
    type Children: Submodules<'heap>;

    fn name() -> Symbol<'heap>;

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        cache: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S>;
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
