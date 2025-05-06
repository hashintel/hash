use super::{
    ModuleId, ModuleRegistry, PartialModule,
    item::{IntrinsicItem, Item, ItemKind, Universe},
};
use crate::{
    heap::Heap,
    span::SpanId,
    r#type::{
        PartialType, TypeId,
        environment::Environment,
        kind::{
            OpaqueType, Param, PrimitiveType, TypeKind, UnionType,
            generic::{GenericArgument, GenericArguments},
        },
    },
};

pub(super) struct StandardLibrary<'env, 'heap> {
    heap: &'heap Heap,
    env: &'env Environment<'heap>,
    registry: &'env ModuleRegistry<'heap>,
}

impl<'env, 'heap> StandardLibrary<'env, 'heap> {
    pub(super) const fn new(
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
    ) -> Item<'heap> {
        let ident =
            alias.unwrap_or_else(|| name.rsplit_once("::").expect("path should be non-empty").1);
        let ident = self.heap.intern_symbol(ident);

        Item {
            module: parent,
            name: ident,
            kind: ItemKind::Intrinsic(IntrinsicItem {
                name,
                universe: Universe::Value,
            }),
        }
    }

    fn alloc_intrinsic_type(
        &self,
        parent: ModuleId,
        name: &'static str,
        alias: Option<&str>,
    ) -> Item<'heap> {
        let ident =
            alias.unwrap_or_else(|| name.rsplit_once("::").expect("path should be non-empty").1);
        let ident = self.heap.intern_symbol(ident);

        Item {
            module: parent,
            name: ident,
            kind: ItemKind::Intrinsic(IntrinsicItem {
                name,
                universe: Universe::Type,
            }),
        }
    }

    fn alloc_type(&self, kind: TypeKind<'heap>) -> TypeId {
        self.env.intern_type(PartialType {
            span: SpanId::SYNTHETIC,
            kind: self.env.intern_kind(kind),
        })
    }

    fn alloc_type_item(&self, parent: ModuleId, name: &'static str, kind: TypeId) -> Item<'heap> {
        Item {
            module: parent,
            name: self.heap.intern_symbol(name),
            kind: ItemKind::Type(kind),
        }
    }

    fn kernel_special_form_module(&self, parent: ModuleId) -> ModuleId {
        self.registry.intern_module(|id| {
            let id = id.value();

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

            PartialModule {
                name: self.heap.intern_symbol("special_form"),
                parent,
                items: self.registry.intern_items(&items),
            }
        })
    }

    fn kernel_type_module_primitives(&self, parent: ModuleId, items: &mut Vec<Item<'heap>>) {
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

    fn kernel_type_module_boundary(&self, parent: ModuleId, items: &mut Vec<Item<'heap>>) {
        items.extend_from_slice(&[
            self.alloc_type_item(parent, "Unknown", self.alloc_type(TypeKind::Unknown)),
            self.alloc_type_item(parent, "Never", self.alloc_type(TypeKind::Never)),
            self.alloc_type_item(parent, "?", self.alloc_type(TypeKind::Unknown)),
            self.alloc_type_item(parent, "!", self.alloc_type(TypeKind::Never)),
        ]);
    }

    fn kernel_type_module_intrinsics(&self, parent: ModuleId, items: &mut Vec<Item<'heap>>) {
        // Struct/Tuple are purposefully excluded, as they are
        // fundamental types and do not have any meaningful value constructors.
        // Union and Type only have constructors for their respective types, but no meaningful
        // types.
        items.extend_from_slice(&[
            self.alloc_intrinsic_type(parent, "::kernel::type::List", None),
            self.alloc_intrinsic_value(parent, "::kernel::type::List", None),
            self.alloc_intrinsic_type(parent, "::kernel::type::Dict", None),
            self.alloc_intrinsic_value(parent, "::kernel::type::Dict", None),
            self.alloc_intrinsic_value(parent, "::kernel::type::Union", None),
            self.alloc_intrinsic_value(parent, "::kernel::type::Intersection", None),
        ]);
    }

    fn kernel_type_module_opaque(&self, parent: ModuleId, items: &mut Vec<Item<'heap>>) {
        let url = self.alloc_type(TypeKind::Opaque(OpaqueType {
            name: self.heap.intern_symbol("::kernel::type::Url"),
            repr: self.env.intern_type(PartialType {
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

    fn kernel_type_module_option(&self, parent: ModuleId, items: &mut Vec<Item<'heap>>) {
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

        let option = self.env.intern_type(PartialType {
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

    fn kernel_type_module_result(&self, parent: ModuleId, items: &mut Vec<Item<'heap>>) {
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

        let result = self.env.intern_type(PartialType {
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

    fn kernel_type_module(&self, parent: ModuleId) -> ModuleId {
        self.registry.intern_module(|id| {
            let id = id.value();

            let mut items = Vec::with_capacity(64);
            self.kernel_type_module_primitives(id, &mut items);
            self.kernel_type_module_boundary(id, &mut items);
            self.kernel_type_module_intrinsics(id, &mut items);
            self.kernel_type_module_opaque(id, &mut items);
            self.kernel_type_module_option(id, &mut items);
            self.kernel_type_module_result(id, &mut items);

            PartialModule {
                name: self.heap.intern_symbol("type"),
                parent,
                items: self.registry.intern_items(&items),
            }
        })
    }

    fn kernel_module(&self) -> ModuleId {
        self.registry.intern_module(|id| PartialModule {
            name: self.heap.intern_symbol("kernel"),
            parent: ModuleId::ROOT,
            items: self.registry.intern_items(&[
                Item {
                    module: id.value(),
                    name: self.heap.intern_symbol("special_form"),
                    kind: ItemKind::Module(self.kernel_special_form_module(id.value())),
                },
                Item {
                    module: id.value(),
                    name: self.heap.intern_symbol("type"),
                    kind: ItemKind::Module(self.kernel_type_module(id.value())),
                },
            ]),
        })
    }

    fn math_module(&self) -> ModuleId {
        self.registry.intern_module(|id| {
            let id = id.value();

            PartialModule {
                name: self.heap.intern_symbol("math"),
                parent: ModuleId::ROOT,
                items: self.registry.intern_items(&[
                    // Addition
                    self.alloc_intrinsic_value(id, "::math::add", None),
                    self.alloc_intrinsic_value(id, "::math::add", Some("+")),
                    // Subtraction
                    self.alloc_intrinsic_value(id, "::math::sub", None),
                    self.alloc_intrinsic_value(id, "::math::sub", Some("-")),
                    // Multiplication
                    self.alloc_intrinsic_value(id, "::math::mul", None),
                    self.alloc_intrinsic_value(id, "::math::mul", Some("*")),
                    // Division
                    self.alloc_intrinsic_value(id, "::math::div", None),
                    self.alloc_intrinsic_value(id, "::math::div", Some("/")),
                    // Modulo
                    self.alloc_intrinsic_value(id, "::math::mod", None),
                    self.alloc_intrinsic_value(id, "::math::mod", Some("%")),
                    // Power
                    self.alloc_intrinsic_value(id, "::math::pow", None),
                    self.alloc_intrinsic_value(id, "::math::pow", Some("^")),
                    // Bitwise operations
                    self.alloc_intrinsic_value(id, "::math::bit_and", None),
                    self.alloc_intrinsic_value(id, "::math::bit_and", Some("&")),
                    self.alloc_intrinsic_value(id, "::math::bit_or", None),
                    self.alloc_intrinsic_value(id, "::math::bit_or", Some("|")),
                    self.alloc_intrinsic_value(id, "::math::bit_not", None),
                    self.alloc_intrinsic_value(id, "::math::bit_not", Some("~")),
                    self.alloc_intrinsic_value(id, "::math::bit_shl", None),
                    self.alloc_intrinsic_value(id, "::math::bit_shl", Some("<<")),
                    self.alloc_intrinsic_value(id, "::math::bit_shr", None),
                    self.alloc_intrinsic_value(id, "::math::bit_shr", Some(">>")),
                    // Comparison operations
                    self.alloc_intrinsic_value(id, "::math::gt", None),
                    self.alloc_intrinsic_value(id, "::math::gt", Some(">")),
                    self.alloc_intrinsic_value(id, "::math::lt", None),
                    self.alloc_intrinsic_value(id, "::math::lt", Some("<")),
                    self.alloc_intrinsic_value(id, "::math::gte", None),
                    self.alloc_intrinsic_value(id, "::math::gte", Some(">=")),
                    self.alloc_intrinsic_value(id, "::math::lte", None),
                    self.alloc_intrinsic_value(id, "::math::lte", Some("<=")),
                    self.alloc_intrinsic_value(id, "::math::eq", None),
                    self.alloc_intrinsic_value(id, "::math::eq", Some("==")),
                    self.alloc_intrinsic_value(id, "::math::ne", None),
                    self.alloc_intrinsic_value(id, "::math::ne", Some("!=")),
                    // Logical operations
                    self.alloc_intrinsic_value(id, "::math::not", None),
                    self.alloc_intrinsic_value(id, "::math::not", Some("!")),
                    self.alloc_intrinsic_value(id, "::math::and", None),
                    self.alloc_intrinsic_value(id, "::math::and", Some("&&")),
                    self.alloc_intrinsic_value(id, "::math::or", None),
                    self.alloc_intrinsic_value(id, "::math::or", Some("||")),
                ]),
            }
        })
    }

    pub(super) fn register(&self) {
        self.registry.register(self.kernel_module());
        self.registry.register(self.math_module());

        // TODO: The graph module is not yet added (Primarily due to the fact that we're not yet
        // sure about the shape of some of the types involved).
    }
}
