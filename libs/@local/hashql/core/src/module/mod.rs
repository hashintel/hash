// TODO: This might move into the HIR instead, if required
pub mod import;
pub mod item;

use std::sync::Mutex;

use hashbrown::HashMap;

use self::item::{IntrinsicItem, Item, ItemId, ItemIdProducer, ItemKind, Universe};
use crate::{
    heap::Heap,
    newtype, newtype_producer,
    span::SpanId,
    symbol::InternedSymbol,
    r#type::{
        Type, TypeId,
        environment::Environment,
        kind::{
            IntrinsicType, OpaqueType, Param, PrimitiveType, TypeKind, UnionType,
            generic_argument::{GenericArgument, GenericArguments},
            intrinsic::{DictType, ListType},
        },
    },
};

newtype!(pub struct ModuleId(u32 is 0..=0xFFFF_FF00));
newtype_producer!(struct ModuleIdProducer(ModuleId));

pub struct ModuleRegistry<'heap> {
    heap: &'heap Heap,

    module_id: ModuleIdProducer,
    item_id: ItemIdProducer,

    tree: Mutex<HashMap<InternedSymbol<'heap>, &'heap Module<'heap>, foldhash::fast::RandomState>>,
}

impl<'heap> ModuleRegistry<'heap> {
    pub fn new(heap: &'heap Heap) -> Self {
        Self {
            heap,
            module_id: ModuleIdProducer::new(),
            item_id: ItemIdProducer::new(),
            tree: Mutex::new(HashMap::default()),
        }
    }

    pub fn alloc_module(
        &self,
        closure: impl FnOnce(ModuleId) -> Module<'heap>,
    ) -> &'heap Module<'heap> {
        let id = self.module_id.next();
        let module = closure(id);

        self.heap.alloc(module)
    }

    pub fn alloc_item(&self, closure: impl FnOnce(ItemId) -> Item<'heap>) -> &'heap Item<'heap> {
        let id = self.item_id.next();
        let item = closure(id);

        self.heap.alloc(item)
    }

    pub fn alloc_items(&self, items: &[&'heap Item<'heap>]) -> &'heap [&'heap Item<'heap>] {
        self.heap.slice(items)
    }

    #[inline]
    fn lock_tree<T>(
        &self,
        closure: impl FnOnce(
            &mut HashMap<InternedSymbol<'heap>, &'heap Module<'heap>, foldhash::fast::RandomState>,
        ) -> T,
    ) -> T {
        closure(&mut self.tree.lock().expect("lock should not be poisoned"))
    }

    pub fn register_module(&self, name: InternedSymbol<'heap>, module: &'heap Module<'heap>) {
        self.lock_tree(|modules| modules.insert(name, module));
    }

    pub fn find_by_name(&self, name: &str) -> Option<&'heap Module<'heap>> {
        self.lock_tree(|modules| modules.get(name).copied())
    }

    pub fn find_by_id(&self, id: ModuleId) -> Option<&'heap Module<'heap>> {
        self.lock_tree(|modules| modules.values().find(|module| module.id == id).copied())
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Module<'heap> {
    pub id: ModuleId,

    pub items: &'heap [&'heap Item<'heap>],
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
    ) -> &'heap Item<'heap> {
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
    ) -> &'heap Item<'heap> {
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

    fn alloc_type_item(
        &self,
        parent: ModuleId,
        name: &'static str,
        kind: TypeId,
    ) -> &'heap Item<'heap> {
        self.registry.alloc_item(|id| Item {
            id,
            parent,
            name: self.heap.intern_symbol(name),
            kind: ItemKind::Type(kind),
        })
    }

    fn kernel_special_form_module(&self) -> &'heap Module<'heap> {
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

    fn kernel_type_module_primitives(&self, parent: ModuleId, items: &mut Vec<&'heap Item<'heap>>) {
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

    fn kernel_type_module_boundary(&self, parent: ModuleId, items: &mut Vec<&'heap Item<'heap>>) {
        items.extend_from_slice(&[
            self.alloc_type_item(parent, "Unknown", self.alloc_type(TypeKind::Unknown)),
            self.alloc_type_item(parent, "Never", self.alloc_type(TypeKind::Never)),
            self.alloc_type_item(parent, "?", self.alloc_type(TypeKind::Unknown)),
            self.alloc_type_item(parent, "!", self.alloc_type(TypeKind::Never)),
        ]);
    }

    fn kernel_type_module_intrinsics(&self, parent: ModuleId, items: &mut Vec<&'heap Item<'heap>>) {
        // Union/Intersection/Struct/Tuple are purposefully excluded, as they are
        // fundamental types and do not have any meaningful value constructors.
        items.extend_from_slice(&[
            self.alloc_intrinsic_type(parent, "::kernel::type::List", None),
            self.alloc_intrinsic_value(parent, "::kernel::type::List", None),
            self.alloc_intrinsic_type(parent, "::kernel::type::Dict", None),
            self.alloc_intrinsic_value(parent, "::kernel::type::Dict", None),
        ]);
    }

    fn kernel_type_module_opaque(&self, parent: ModuleId, items: &mut Vec<&'heap Item<'heap>>) {
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

    fn kernel_type_module_option(&self, parent: ModuleId, items: &mut Vec<&'heap Item<'heap>>) {
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
            self.alloc_type_item(parent, "Some", some),
            self.alloc_type_item(parent, "Option", option),
        ])
    }

    #[expect(clippy::too_many_lines)]
    fn kernel_type_module(&self) -> &'heap Module<'heap> {
        let option_value = self.env.counter.generic_argument.next();
        let result_value = self.env.counter.generic_argument.next();
        let result_error = self.env.counter.generic_argument.next();

        self.registry.alloc_module(|id| {
            let mut items = Vec::with_capacity(64);
            self.kernel_type_module_primitives(id, &mut items);
            self.kernel_type_module_boundary(id, &mut items);
            self.kernel_type_module_intrinsics(id, &mut items);
            self.kernel_type_module_opaque(id, &mut items);

            let items = [
                // == Option ==
                // Option is simply a union of two opaque types: Some and None
                self.alloc_type_item(id, "Some", kind),
            ];

            Module {
                id,
                items: self.registry.alloc_items(&items),
            }
        })
    }

    fn populate_kernel(&self) {}

    pub fn populate(&self) {}
}
