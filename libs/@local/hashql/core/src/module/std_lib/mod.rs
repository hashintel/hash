pub mod core;
pub mod graph;
mod kernel;

use ::core::{alloc::Allocator, iter, mem, mem::MaybeUninit, num::NonZero};

use super::{Module, ModuleId, PartialModuleRegistry, item::IntrinsicItem, locals::TypeDef};
use crate::{
    id::{Id as _, bit_vec::FiniteBitSet},
    module::item::{ConstructorItem, Item, ItemKind},
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

struct ModuleDef<'heap, S: Allocator> {
    entries: Vec<ModuleEntry<'heap>, S>,
    /// The number of items that will be emitted when this module is built.
    ///
    /// This differs from `entries.len()` because `Newtype` entries emit two items (a constructor
    /// and a type), while other entries emit one.
    emitted_len: usize,
}

impl<'heap, S: Allocator> ModuleDef<'heap, S> {
    fn new_in(alloc: S) -> Self {
        Self {
            entries: Vec::with_capacity_in(16, alloc),
            emitted_len: 0,
        }
    }

    fn push(&mut self, name: Symbol<'heap>, def: ItemDef<'heap>) -> usize {
        let index = self.entries.len();
        self.emitted_len += def.emitted_len();
        self.entries.push(ModuleEntry::new(name, def));
        index
    }

    // with gen-blocks we'd be able to return an iterator over the indices for free
    fn push_aliased(
        &mut self,
        names: impl IntoIterator<Item = Symbol<'heap>>,
        def: ItemDef<'heap>,
    ) {
        let names = names.into_iter();

        self.entries.reserve(names.size_hint().0);

        for name in names {
            self.push(name, def);
        }
    }

    fn alias(&mut self, index: usize, alias: Symbol<'heap>) -> usize {
        let item = self.entries[index].alias(alias);
        self.emitted_len += item.def.emitted_len();

        let index = self.entries.len();
        self.entries.push(item);
        index
    }

    fn find(&self, name: Symbol<'heap>) -> Option<ModuleEntry<'heap>> {
        self.entries.iter().find(|item| item.name == name).copied()
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

impl ItemDef<'_> {
    /// Returns the number of items emitted when building this definition.
    ///
    /// `Newtype` emits both a constructor and a type; other variants emit one item.
    const fn emitted_len(self) -> usize {
        match self {
            Self::Newtype(_) => 2,
            Self::Type(_) | Self::Intrinsic(_) => 1,
        }
    }
}

/// Index into the `ModuleCache` entries array.
///
/// Variants are listed in preorder traversal of the module tree (parent before children, left
/// before right). Adding a new stdlib module requires adding a variant here in the correct
/// position.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, hashql_macros::Id)]
#[id(const, crate = crate)]
enum CacheId {
    Core,
    CoreBits,
    CoreBool,
    CoreCmp,
    CoreJson,
    CoreMath,
    CoreOption,
    CoreResult,
    CoreUrl,
    CoreUuid,
    Kernel,
    KernelSpecialForm,
    KernelType,
    Graph,
    GraphTemporal,
    GraphHead,
    GraphBody,
    GraphTail,
    GraphEntity,
    GraphTmp,
    GraphTypes,
    GraphTypesKnowledge,
    GraphTypesKnowledgeEntity,
    GraphTypesOntology,
    GraphTypesOntologyEntityType,
    GraphTypesPrincipal,
    GraphTypesPrincipalActorGroup,
    GraphTypesPrincipalActorGroupWeb,
}

struct StandardLibraryContext<'env, 'heap, S: Allocator> {
    pub instantiate: InstantiateEnvironment<'env, 'heap>,
    pub registry: &'env mut PartialModuleRegistry<'heap, S>,
    pub ty: TypeBuilder<'env, 'heap>,
    pub alloc: S,
}

struct ModuleCache<'heap, S: Allocator> {
    entries: Box<[MaybeUninit<ModuleDef<'heap, S>>], S>,
    /// Tracks which cache entries have been initialized.
    ///
    /// Bit `i` is set when `entries[i]` has been written. The stdlib has fewer than 64 modules, so
    /// a `u64`-backed `FiniteBitSet` suffices.
    occupied: FiniteBitSet<CacheId, u64>,
}

#[expect(unsafe_code)]
impl<'heap, S: Allocator> ModuleCache<'heap, S> {
    fn new_in(count: u32, alloc: S) -> Self {
        Self {
            entries: Box::new_uninit_slice_in(count as usize, alloc),
            occupied: FiniteBitSet::new_empty(count),
        }
    }

    fn request<T: StandardLibraryModule<'heap>>(
        &mut self,
        context: &mut StandardLibraryContext<'_, 'heap, S>,
    ) -> &ModuleDef<'heap, S>
    where
        S: Clone,
    {
        let id = T::CACHE_ID;

        if self.occupied.contains(id) {
            // SAFETY: the bit is set only after the entry has been initialized.
            return unsafe { self.entries[id.as_usize()].assume_init_ref() };
        }

        let module = T::define(context, self);
        let value = self.entries[id.as_usize()].write(module);
        self.occupied.insert(id);
        value
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
        let module = context.registry.provision_module();
        let emitted = self.request::<T>(context).emitted_len;

        let mut output =
            Vec::with_capacity_in(emitted + T::Children::LENGTH, context.alloc.clone());

        T::Children::names()
            .into_iter()
            .zip(T::Children::modules(
                context,
                self,
                depth.saturating_add(1),
                module,
            ))
            .map(|(name, child)| Item {
                module,
                name,
                kind: ItemKind::Module(child),
            })
            .collect_into(&mut output);

        let def = self.request::<T>(context);

        for &ModuleEntry { name, def } in &def.entries {
            match def {
                ItemDef::Intrinsic(intrinsic) => {
                    output.push(Item {
                        module,
                        name,
                        kind: ItemKind::Intrinsic(intrinsic),
                    });
                }
                ItemDef::Type(typedef) => {
                    output.push(Item {
                        module,
                        name,
                        kind: ItemKind::Type(typedef),
                    });
                }
                ItemDef::Newtype(typedef) => {
                    output.push(Item {
                        module,
                        name,
                        kind: ItemKind::Constructor(ConstructorItem { r#type: typedef }),
                    });
                    output.push(Item {
                        module,
                        name,
                        kind: ItemKind::Type(typedef),
                    });
                }
            }
        }

        let module = Module {
            id: module,
            name: T::name(),
            parent,
            depth,
            items: context.registry.intern_items(&output),
        };

        context.registry.insert_module(module);
        module.id
    }
}

#[expect(unsafe_code)]
impl<S: Allocator> Drop for ModuleCache<'_, S> {
    fn drop(&mut self) {
        for index in &self.occupied {
            // SAFETY: the bit is set only after the entry has been initialized.
            unsafe {
                self.entries[index.as_usize()].assume_init_drop();
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
        registry: &'env mut PartialModuleRegistry<'heap, S>,
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

    #[expect(
        clippy::cast_possible_truncation,
        reason = "module count is less than u32::MAX"
    )]
    pub(super) fn register(&mut self)
    where
        S: Clone,
    {
        type Root = (self::core::Core, self::kernel::Kernel, self::graph::Graph);
        const ONE: NonZero<u32> = NonZero::new(1).unwrap();
        const MODULE_COUNT: usize = mem::variant_count::<CacheId>();

        debug_assert_eq!(
            Root::ITEMS,
            MODULE_COUNT,
            "CacheId variant count does not match module tree size",
        );

        let alloc = self.context.alloc.clone();

        let mut cache = ModuleCache::new_in(MODULE_COUNT as u32, alloc);

        let mut output = [ModuleId::ROOT; Root::LENGTH];
        for (module, output) in Root::modules(&mut self.context, &mut cache, ONE, ModuleId::ROOT)
            .into_iter()
            .zip(&mut output)
        {
            *output = module;
        }

        for module in output {
            self.context.registry.register(module);
        }
    }
}

trait Submodules<'heap> {
    const LENGTH: usize;
    const ITEMS: usize;

    fn names() -> impl IntoIterator<Item = Symbol<'heap>>;

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
    /// Unique index for this module in the `ModuleCache` entries array.
    ///
    /// Assigned in preorder traversal of the module tree (parent before children, left before
    /// right). IDs must be unique across all stdlib modules and less than 64.
    const CACHE_ID: CacheId;

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
            arguments: if ${count($generic)} > 0 {
                $lib.ty.env.intern_generic_argument_references(&[$(${concat($generic, _ref)}),*])
            } else {
                crate::intern::Interned::empty()
            },
        }
    }};
}

pub(in crate::module::std_lib) use decl;
