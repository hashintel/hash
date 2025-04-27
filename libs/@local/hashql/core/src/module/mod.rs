// TODO: This might move into the HIR instead, if required
pub mod import;
pub mod item;

use std::sync::Mutex;

use hashbrown::HashMap;

use self::item::{IntrinsicItem, Item, ItemId, ItemKind, Universe};
use crate::{
    arena::concurrent::ConcurrentArena,
    heap::Heap,
    id::HasId,
    newtype,
    span::SpanId,
    symbol::InternedSymbol,
    r#type::{
        Type, TypeId,
        environment::Environment,
        kind::{
            OpaqueType, Param, PrimitiveType, TypeKind, UnionType,
            generic_argument::{GenericArgument, GenericArguments},
        },
    },
};

newtype!(pub struct ModuleId(u32 is 0..=0xFFFF_FF00));

pub struct ModuleRegistry<'heap> {
    heap: &'heap Heap,

    // TODO: intern instead
    modules: ConcurrentArena<Module<'heap>>,
    items: ConcurrentArena<Item<'heap>>,

    tree: Mutex<HashMap<InternedSymbol<'heap>, ModuleId, foldhash::fast::RandomState>>,
}

impl<'heap> ModuleRegistry<'heap> {
    pub fn new(heap: &'heap Heap) -> Self {
        Self {
            heap,
            modules: ConcurrentArena::new(),
            items: ConcurrentArena::new(),
            tree: Mutex::new(HashMap::default()),
        }
    }

    pub fn alloc_module(&self, closure: impl FnOnce(ModuleId) -> Module<'heap>) -> ModuleId {
        self.modules.push_with(closure)
    }

    pub fn alloc_item(&self, closure: impl FnOnce(ItemId) -> Item<'heap>) -> ItemId {
        self.items.push_with(closure)
    }

    pub fn alloc_items(&self, items: &[ItemId]) -> &'heap [ItemId] {
        self.heap.slice(items)
    }

    #[inline]
    fn lock_tree<T>(
        &self,
        closure: impl FnOnce(
            &mut HashMap<InternedSymbol<'heap>, ModuleId, foldhash::fast::RandomState>,
        ) -> T,
    ) -> T {
        closure(&mut self.tree.lock().expect("lock should not be poisoned"))
    }

    pub fn register_module(&self, name: InternedSymbol<'heap>, module: ModuleId) {
        self.lock_tree(|modules| modules.insert(name, module));
    }

    pub fn find_by_name(&self, name: &str) -> Option<Module<'heap>> {
        let id = self.lock_tree(|modules| modules.get(name).copied())?;

        Some(self.modules[id].copied())
    }

    pub fn find_by_id(&self, id: ModuleId) -> Option<Module<'heap>> {
        self.lock_tree(|modules| {
            modules.values().find_map(|&module_id| {
                let module = self.modules[module_id].copied();

                (module.id == id).then_some(module)
            })
        })
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Module<'heap> {
    pub id: ModuleId,

    pub items: &'heap [ItemId],
}

impl HasId for Module<'_> {
    type Id = ModuleId;

    fn id(&self) -> Self::Id {
        self.id
    }
}

pub struct StandardLibrary<'env, 'heap> {
    heap: &'heap Heap,
    env: &'env Environment<'heap>,
    registry: &'env ModuleRegistry<'heap>,
}

impl<'env, 'heap> StandardLibrary<'env, 'heap> {
    pub const fn new(
        environment: &'env Environment<'heap>,
        registry: &'env ModuleRegistry<'heap>,
    ) -> Self {
        Self {
            heap: environment.heap,
            env: environment,
            registry,
        }
    }

    fn alloc_intrinsic_value(
        &self,
        parent: ModuleId,
        name: &'static str,
        alias: Option<&str>,
    ) -> ItemId {
        let ident =
            alias.unwrap_or_else(|| name.rsplit_once("::").expect("path should be non-empty").1);
        let ident = self.heap.intern_symbol(ident);

        self.registry.alloc_item(|id| Item {
            id,
            parent,
            name: ident,
            kind: ItemKind::Intrinsic(IntrinsicItem {
                name,
                universe: Universe::Value,
            }),
        })
    }

    fn alloc_intrinsic_type(
        &self,
        parent: ModuleId,
        name: &'static str,
        alias: Option<&str>,
    ) -> ItemId {
        let ident =
            alias.unwrap_or_else(|| name.rsplit_once("::").expect("path should be non-empty").1);
        let ident = self.heap.intern_symbol(ident);

        self.registry.alloc_item(|id| Item {
            id,
            parent,
            name: ident,
            kind: ItemKind::Intrinsic(IntrinsicItem {
                name,
                universe: Universe::Type,
            }),
        })
    }

    fn alloc_type(&self, kind: TypeKind<'heap>) -> TypeId {
        self.env.alloc(|id| Type {
            id,
            span: SpanId::SYNTHETIC,
            kind: self.env.intern_kind(kind),
        })
    }

    fn alloc_type_item(&self, parent: ModuleId, name: &'static str, kind: TypeId) -> ItemId {
        self.registry.alloc_item(|id| Item {
            id,
            parent,
            name: self.heap.intern_symbol(name),
            kind: ItemKind::Type(kind),
        })
    }

    fn kernel_special_form_module(&self) -> ModuleId {
        self.registry.alloc_module(|id| {
            let items = [
                self.alloc_intrinsic_value(id, "::kernel::special_form::if", None),
                self.alloc_intrinsic_value(id, "::kernel::special_form::is", None),
                self.alloc_intrinsic_value(id, "::kernel::special_form::let", None),
                self.alloc_intrinsic_value(id, "::kernel::special_form::type", None),
                self.alloc_intrinsic_value(id, "::kernel::special_form::newtype", None),
                self.alloc_intrinsic_value(id, "::kernel::special_form::use", None),
                self.alloc_intrinsic_value(id, "::kernel::special_form::fn", None),
                self.alloc_intrinsic_value(id, "::kernel::special_form::input", None),
                self.alloc_intrinsic_value(id, "::kernel::special_form::access", Some(".")),
                self.alloc_intrinsic_value(id, "::kernel::special_form::access", None),
                self.alloc_intrinsic_value(id, "::kernel::special_form::index", Some("[]")),
                self.alloc_intrinsic_value(id, "::kernel::special_form::index", None),
            ];

            Module {
                id,
                items: self.registry.alloc_items(&items),
            }
        })
    }

    fn kernel_type_module_primitives(&self, parent: ModuleId, items: &mut Vec<ItemId>) {
        items.extend_from_slice(&[
            self.alloc_type_item(
                parent,
                "Boolean",
                self.alloc_type(TypeKind::Primitive(PrimitiveType::Boolean)),
            ),
            self.alloc_type_item(
                parent,
                "Null",
                self.alloc_type(TypeKind::Primitive(PrimitiveType::Null)),
            ),
            self.alloc_type_item(
                parent,
                "Number",
                self.alloc_type(TypeKind::Primitive(PrimitiveType::Number)),
            ),
            self.alloc_type_item(
                parent,
                "Integer",
                self.alloc_type(TypeKind::Primitive(PrimitiveType::Integer)),
            ),
            // Natural does not yet exist, due to lack of support for refinements
            self.alloc_type_item(
                parent,
                "String",
                self.alloc_type(TypeKind::Primitive(PrimitiveType::String)),
            ),
        ]);
    }

    fn kernel_type_module_boundary(&self, parent: ModuleId, items: &mut Vec<ItemId>) {
        items.extend_from_slice(&[
            self.alloc_type_item(parent, "Unknown", self.alloc_type(TypeKind::Unknown)),
            self.alloc_type_item(parent, "Never", self.alloc_type(TypeKind::Never)),
            self.alloc_type_item(parent, "?", self.alloc_type(TypeKind::Unknown)),
            self.alloc_type_item(parent, "!", self.alloc_type(TypeKind::Never)),
        ]);
    }

    fn kernel_type_module_intrinsics(&self, parent: ModuleId, items: &mut Vec<ItemId>) {
        // Union/Intersection/Struct/Tuple are purposefully excluded, as they are
        // fundamental types and do not have any meaningful value constructors.
        items.extend_from_slice(&[
            self.alloc_intrinsic_type(parent, "::kernel::type::List", None),
            self.alloc_intrinsic_value(parent, "::kernel::type::List", None),
            self.alloc_intrinsic_type(parent, "::kernel::type::Dict", None),
            self.alloc_intrinsic_value(parent, "::kernel::type::Dict", None),
        ]);
    }

    fn kernel_type_module_opaque(&self, parent: ModuleId, items: &mut Vec<ItemId>) {
        let url = self.alloc_type(TypeKind::Opaque(OpaqueType {
            name: self.heap.intern_symbol("::kernel::type::Url"),
            repr: self.env.alloc(|id| Type {
                id,
                span: SpanId::SYNTHETIC,
                kind: self
                    .env
                    .intern_kind(TypeKind::Primitive(PrimitiveType::String)),
            }),
            arguments: GenericArguments::empty(),
        }));

        // The intrinsics that are registered correspond to the constructor functions, in
        // the future we should replace these with proper functions instead of using
        // intrinsics.
        // see: https://linear.app/hash/issue/H-4451/hashql-prelude-opaque-type-constructors-should-be-alone-standing
        items.extend_from_slice(&[
            self.alloc_type_item(parent, "Url", url),
            self.alloc_intrinsic_value(parent, "::kernel::type::Url", None),
            self.alloc_type_item(
                parent,
                "BaseUrl",
                self.alloc_type(TypeKind::Opaque(OpaqueType {
                    name: self.heap.intern_symbol("::kernel::type::BaseUrl"),
                    repr: url,
                    arguments: GenericArguments::empty(),
                })),
            ),
            self.alloc_intrinsic_value(parent, "::kernel::type::BaseUrl", None),
        ]);
    }

    fn kernel_type_module_option(&self, parent: ModuleId, items: &mut Vec<ItemId>) {
        // Option is simply a union between two opaque types, when the constructor only takes a
        // `Null` the constructor automatically allows for no-value.
        let some_generic = self.env.counter.generic_argument.next();

        let none = self.alloc_type(TypeKind::Opaque(OpaqueType {
            name: self.heap.intern_symbol("::kernel::type::None"),
            repr: self.alloc_type(TypeKind::Primitive(PrimitiveType::Null)),
            arguments: GenericArguments::empty(),
        }));

        let some = self.alloc_type(TypeKind::Opaque(OpaqueType {
            name: self.heap.intern_symbol("::kernel::type::Some"),
            repr: self.alloc_type(TypeKind::Param(Param {
                argument: some_generic,
            })),
            arguments: self.env.intern_generic_arguments(&mut [GenericArgument {
                id: some_generic,
                name: self.heap.intern_symbol("T"),
                constraint: None,
            }]),
        }));

        let option = self.env.alloc(|id| Type {
            id,
            span: SpanId::SYNTHETIC,
            kind: self.env.intern_kind(TypeKind::Union(UnionType {
                variants: self.env.intern_type_ids(&[some, none]),
            })),
        });

        items.extend_from_slice(&[
            self.alloc_type_item(parent, "None", none),
            self.alloc_intrinsic_value(parent, "::kernel::type::None", None),
            self.alloc_type_item(parent, "Some", some),
            self.alloc_intrinsic_value(parent, "::kernel::type::Some", None),
            self.alloc_type_item(parent, "Option", option),
        ]);
    }

    fn kernel_type_module_result(&self, parent: ModuleId, items: &mut Vec<ItemId>) {
        let value_generic = self.env.counter.generic_argument.next();
        let error_generic = self.env.counter.generic_argument.next();

        let ok = self.alloc_type(TypeKind::Opaque(OpaqueType {
            name: self.heap.intern_symbol("::kernel::type::Ok"),
            repr: self.alloc_type(TypeKind::Param(Param {
                argument: value_generic,
            })),
            arguments: self.env.intern_generic_arguments(&mut [GenericArgument {
                id: value_generic,
                name: self.heap.intern_symbol("T"),
                constraint: None,
            }]),
        }));

        let err = self.alloc_type(TypeKind::Opaque(OpaqueType {
            name: self.heap.intern_symbol("::kernel::type::Err"),
            repr: self.alloc_type(TypeKind::Param(Param {
                argument: error_generic,
            })),
            arguments: self.env.intern_generic_arguments(&mut [GenericArgument {
                id: error_generic,
                name: self.heap.intern_symbol("E"),
                constraint: None,
            }]),
        }));

        let result = self.env.alloc(|id| Type {
            id,
            span: SpanId::SYNTHETIC,
            kind: self.env.intern_kind(TypeKind::Union(UnionType {
                variants: self.env.intern_type_ids(&[ok, err]),
            })),
        });

        items.extend_from_slice(&[
            self.alloc_type_item(parent, "Ok", ok),
            self.alloc_intrinsic_value(parent, "::kernel::type::Ok", None),
            self.alloc_type_item(parent, "Err", err),
            self.alloc_intrinsic_value(parent, "::kernel::type::Err", None),
            self.alloc_type_item(parent, "Result", result),
        ]);
    }

    fn kernel_type_module(&self) -> ModuleId {
        self.registry.alloc_module(|id| {
            let mut items = Vec::with_capacity(64);
            self.kernel_type_module_primitives(id, &mut items);
            self.kernel_type_module_boundary(id, &mut items);
            self.kernel_type_module_intrinsics(id, &mut items);
            self.kernel_type_module_opaque(id, &mut items);
            self.kernel_type_module_option(id, &mut items);
            self.kernel_type_module_result(id, &mut items);

            Module {
                id,
                items: self.registry.alloc_items(&items),
            }
        })
    }

    fn kernel_module(&self) -> ModuleId {
        self.registry.alloc_module(|id| Module {
            id,
            items: self.registry.alloc_items(&[
                self.registry.alloc_item(|item_id| Item {
                    id: item_id,
                    parent: id,
                    name: self.heap.intern_symbol("special_form"),
                    kind: ItemKind::Module(self.kernel_special_form_module()),
                }),
                self.registry.alloc_item(|item_id| Item {
                    id: item_id,
                    parent: id,
                    name: self.heap.intern_symbol("type"),
                    kind: ItemKind::Module(self.kernel_type_module()),
                }),
            ]),
        })
    }

    pub fn populate(&self) {
        self.registry
            .register_module(self.heap.intern_symbol("kernel"), self.kernel_module());
    }
}
