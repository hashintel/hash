use super::{
    ModuleId, ModuleRegistry, PartialModule,
    item::{IntrinsicItem, Item, ItemKind, Universe},
};
use crate::{
    heap::Heap,
    span::SpanId,
    symbol::{Symbol, sym::T},
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

    const fn alloc_intrinsic_value(
        parent: ModuleId,
        name: Symbol<'heap>,
        path: &'static str,
    ) -> Item<'heap> {
        Item {
            module: parent,
            name,
            kind: ItemKind::Intrinsic(IntrinsicItem {
                name: path,
                universe: Universe::Value,
            }),
        }
    }

    const fn alloc_intrinsic_type(
        parent: ModuleId,
        name: Symbol<'heap>,
        path: &'static str,
    ) -> Item<'heap> {
        Item {
            module: parent,
            name,
            kind: ItemKind::Intrinsic(IntrinsicItem {
                name: path,
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

    fn alloc_type_item(
        &self,
        parent: ModuleId,
        name: Symbol<'heap>,
        kind: TypeId,
        generics: &[GenericArgument<'heap>],
    ) -> Item<'heap> {
        Item {
            module: parent,
            name,
            kind: ItemKind::Type(kind, self.heap.slice(generics)),
        }
    }

    fn kernel_special_form_module(&self, parent: ModuleId) -> ModuleId {
        self.registry.intern_module(|id| {
            let id = id.value();

            let items = [
                Self::alloc_intrinsic_value(id, T![if], "::kernel::special_form::if"),
                Self::alloc_intrinsic_value(id, T![is], "::kernel::special_form::is"),
                Self::alloc_intrinsic_value(id, T![let], "::kernel::special_form::let"),
                Self::alloc_intrinsic_value(id, T![type], "::kernel::special_form::type"),
                Self::alloc_intrinsic_value(id, T![newtype], "::kernel::special_form::newtype"),
                Self::alloc_intrinsic_value(id, T![use], "::kernel::special_form::use"),
                Self::alloc_intrinsic_value(id, T![fn], "::kernel::special_form::fn"),
                Self::alloc_intrinsic_value(id, T![input], "::kernel::special_form::input"),
                Self::alloc_intrinsic_value(id, T![.], "::kernel::special_form::access"),
                Self::alloc_intrinsic_value(id, T![access], "::kernel::special_form::access"),
                Self::alloc_intrinsic_value(id, T![[]], "::kernel::special_form::index"),
                Self::alloc_intrinsic_value(id, T![index], "::kernel::special_form::index"),
            ];

            PartialModule {
                name: T![special_form],
                parent,
                items: self.registry.intern_items(&items),
            }
        })
    }

    fn kernel_type_module_primitives(&self, parent: ModuleId, items: &mut Vec<Item<'heap>>) {
        items.extend_from_slice(&[
            self.alloc_type_item(
                parent,
                T![Boolean],
                self.alloc_type(TypeKind::Primitive(PrimitiveType::Boolean)),
                &[],
            ),
            self.alloc_type_item(
                parent,
                T![Null],
                self.alloc_type(TypeKind::Primitive(PrimitiveType::Null)),
                &[],
            ),
            self.alloc_type_item(
                parent,
                T![Number],
                self.alloc_type(TypeKind::Primitive(PrimitiveType::Number)),
                &[],
            ),
            self.alloc_type_item(
                parent,
                T![Integer],
                self.alloc_type(TypeKind::Primitive(PrimitiveType::Integer)),
                &[],
            ),
            // Natural does not yet exist, due to lack of support for refinements
            self.alloc_type_item(
                parent,
                T![String],
                self.alloc_type(TypeKind::Primitive(PrimitiveType::String)),
                &[],
            ),
        ]);
    }

    fn kernel_type_module_boundary(&self, parent: ModuleId, items: &mut Vec<Item<'heap>>) {
        items.extend_from_slice(&[
            self.alloc_type_item(parent, T![Unknown], self.alloc_type(TypeKind::Unknown), &[]),
            self.alloc_type_item(parent, T![Never], self.alloc_type(TypeKind::Never), &[]),
            self.alloc_type_item(parent, T![?], self.alloc_type(TypeKind::Unknown), &[]),
            self.alloc_type_item(parent, T![!], self.alloc_type(TypeKind::Never), &[]),
        ]);
    }

    fn kernel_type_module_intrinsics(parent: ModuleId, items: &mut Vec<Item<'heap>>) {
        // Struct/Tuple are purposefully excluded, as they are
        // fundamental types and do not have any meaningful value constructors.
        // Union and Type only have constructors for their respective types, but no meaningful
        // types.
        items.extend_from_slice(&[
            Self::alloc_intrinsic_type(parent, T![List], "::kernel::type::List"),
            Self::alloc_intrinsic_value(parent, T![List], "::kernel::type::List"),
            Self::alloc_intrinsic_type(parent, T![Dict], "::kernel::type::Dict"),
            Self::alloc_intrinsic_value(parent, T![Dict], "::kernel::type::Dict"),
            Self::alloc_intrinsic_value(parent, T![Union], "::kernel::type::Union"),
            Self::alloc_intrinsic_value(parent, T![Intersection], "::kernel::type::Intersection"),
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
            self.alloc_type_item(parent, T![Url], url, &[]),
            Self::alloc_intrinsic_value(parent, T![Url], "::kernel::type::Url"),
            self.alloc_type_item(
                parent,
                T![BaseUrl],
                self.alloc_type(TypeKind::Opaque(OpaqueType {
                    name: self.heap.intern_symbol("::kernel::type::BaseUrl"),
                    repr: url,
                    arguments: GenericArguments::empty(),
                })),
                &[],
            ),
            Self::alloc_intrinsic_value(parent, T![BaseUrl], "::kernel::type::BaseUrl"),
        ]);
    }

    fn kernel_type_module_option(&self, parent: ModuleId, items: &mut Vec<Item<'heap>>) {
        // Option is simply a union between two opaque types, when the constructor only takes a
        // `Null` the constructor automatically allows for no-value.
        let some_generic = self.env.counter.generic_argument.next();
        let some_generic_argument = GenericArgument {
            id: some_generic,
            name: T![T],
            constraint: None,
        };

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
            arguments: self
                .env
                .intern_generic_arguments(&mut [some_generic_argument]),
        }));

        let option = self.env.intern_type(PartialType {
            span: SpanId::SYNTHETIC,
            kind: self.env.intern_kind(TypeKind::Union(UnionType {
                variants: self.env.intern_type_ids(&[some, none]),
            })),
        });

        items.extend_from_slice(&[
            self.alloc_type_item(parent, T![None], none, &[]),
            Self::alloc_intrinsic_value(parent, T![None], "::kernel::type::None"),
            self.alloc_type_item(parent, T![Some], some, &[some_generic_argument]),
            Self::alloc_intrinsic_value(parent, T![Some], "::kernel::type::Some"),
            self.alloc_type_item(parent, T![Option], option, &[some_generic_argument]),
        ]);
    }

    fn kernel_type_module_result(&self, parent: ModuleId, items: &mut Vec<Item<'heap>>) {
        let value_generic = self.env.counter.generic_argument.next();
        let value_generic_argument = GenericArgument {
            id: value_generic,
            name: T![T],
            constraint: None,
        };

        let error_generic = self.env.counter.generic_argument.next();
        let error_generic_argument = GenericArgument {
            id: error_generic,
            name: T![E],
            constraint: None,
        };

        let ok = self.alloc_type(TypeKind::Opaque(OpaqueType {
            name: self.heap.intern_symbol("::kernel::type::Ok"),
            repr: self.alloc_type(TypeKind::Param(Param {
                argument: value_generic,
            })),
            arguments: self
                .env
                .intern_generic_arguments(&mut [value_generic_argument]),
        }));

        let err = self.alloc_type(TypeKind::Opaque(OpaqueType {
            name: self.heap.intern_symbol("::kernel::type::Err"),
            repr: self.alloc_type(TypeKind::Param(Param {
                argument: error_generic,
            })),
            arguments: self
                .env
                .intern_generic_arguments(&mut [error_generic_argument]),
        }));

        let result = self.env.intern_type(PartialType {
            span: SpanId::SYNTHETIC,
            kind: self.env.intern_kind(TypeKind::Union(UnionType {
                variants: self.env.intern_type_ids(&[ok, err]),
            })),
        });

        items.extend_from_slice(&[
            self.alloc_type_item(parent, T![Ok], ok, &[value_generic_argument]),
            Self::alloc_intrinsic_value(parent, T![Ok], "::kernel::type::Ok"),
            self.alloc_type_item(parent, T![Err], err, &[error_generic_argument]),
            Self::alloc_intrinsic_value(parent, T![Err], "::kernel::type::Err"),
            self.alloc_type_item(
                parent,
                T![Result],
                result,
                &[value_generic_argument, error_generic_argument],
            ),
        ]);
    }

    fn kernel_type_module(&self, parent: ModuleId) -> ModuleId {
        self.registry.intern_module(|id| {
            let id = id.value();

            let mut items = Vec::with_capacity(64);
            self.kernel_type_module_primitives(id, &mut items);
            self.kernel_type_module_boundary(id, &mut items);
            Self::kernel_type_module_intrinsics(id, &mut items);
            self.kernel_type_module_opaque(id, &mut items);
            self.kernel_type_module_option(id, &mut items);
            self.kernel_type_module_result(id, &mut items);

            PartialModule {
                name: T![type],
                parent,
                items: self.registry.intern_items(&items),
            }
        })
    }

    fn kernel_module(&self) -> ModuleId {
        self.registry.intern_module(|id| PartialModule {
            name: T![kernel],
            parent: ModuleId::ROOT,
            items: self.registry.intern_items(&[
                Item {
                    module: id.value(),
                    name: T![special_form],
                    kind: ItemKind::Module(self.kernel_special_form_module(id.value())),
                },
                Item {
                    module: id.value(),
                    name: T![type],
                    kind: ItemKind::Module(self.kernel_type_module(id.value())),
                },
            ]),
        })
    }

    fn math_module(&self) -> ModuleId {
        self.registry.intern_module(|id| {
            let id = id.value();

            PartialModule {
                name: T![math],
                parent: ModuleId::ROOT,
                items: self.registry.intern_items(&[
                    // Addition
                    Self::alloc_intrinsic_value(id, T![add], "::math::add"),
                    Self::alloc_intrinsic_value(id, T![+], "::math::add"),
                    // Subtraction
                    Self::alloc_intrinsic_value(id, T![sub], "::math::sub"),
                    Self::alloc_intrinsic_value(id, T![-], "::math::sub"),
                    // Multiplication
                    Self::alloc_intrinsic_value(id, T![mul], "::math::mul"),
                    Self::alloc_intrinsic_value(id, T![*], "::math::mul"),
                    // Division
                    Self::alloc_intrinsic_value(id, T![div], "::math::div"),
                    Self::alloc_intrinsic_value(id, T![/], "::math::div"),
                    // Modulo
                    Self::alloc_intrinsic_value(id, T![mod], "::math::mod"),
                    Self::alloc_intrinsic_value(id, T![%], "::math::mod"),
                    // Power
                    Self::alloc_intrinsic_value(id, T![pow], "::math::pow"),
                    Self::alloc_intrinsic_value(id, T![^], "::math::pow"),
                    // Bitwise operations
                    Self::alloc_intrinsic_value(id, T![bit_and], "::math::bit_and"),
                    Self::alloc_intrinsic_value(id, T![&], "::math::bit_and"),
                    Self::alloc_intrinsic_value(id, T![bit_or], "::math::bit_or"),
                    Self::alloc_intrinsic_value(id, T![|], "::math::bit_or"),
                    Self::alloc_intrinsic_value(id, T![bit_not], "::math::bit_not"),
                    Self::alloc_intrinsic_value(id, T![~], "::math::bit_not"),
                    Self::alloc_intrinsic_value(id, T![bit_shl], "::math::bit_shl"),
                    Self::alloc_intrinsic_value(id, T![<<], "::math::bit_shl"),
                    Self::alloc_intrinsic_value(id, T![bit_shr], "::math::bit_shr"),
                    Self::alloc_intrinsic_value(id, T![>>], "::math::bit_shr"),
                    // Comparison operations
                    Self::alloc_intrinsic_value(id, T![gt], "::math::gt"),
                    Self::alloc_intrinsic_value(id, T![>], "::math::gt"),
                    Self::alloc_intrinsic_value(id, T![lt], "::math::lt"),
                    Self::alloc_intrinsic_value(id, T![<], "::math::lt"),
                    Self::alloc_intrinsic_value(id, T![gte], "::math::gte"),
                    Self::alloc_intrinsic_value(id, T![>=], "::math::gte"),
                    Self::alloc_intrinsic_value(id, T![lte], "::math::lte"),
                    Self::alloc_intrinsic_value(id, T![<=], "::math::lte"),
                    Self::alloc_intrinsic_value(id, T![eq], "::math::eq"),
                    Self::alloc_intrinsic_value(id, T![==], "::math::eq"),
                    Self::alloc_intrinsic_value(id, T![ne], "::math::ne"),
                    Self::alloc_intrinsic_value(id, T![!=], "::math::ne"),
                    // Logical operations
                    Self::alloc_intrinsic_value(id, T![not], "::math::not"),
                    Self::alloc_intrinsic_value(id, T![!], "::math::not"),
                    Self::alloc_intrinsic_value(id, T![and], "::math::and"),
                    Self::alloc_intrinsic_value(id, T![&&], "::math::and"),
                    Self::alloc_intrinsic_value(id, T![or], "::math::or"),
                    Self::alloc_intrinsic_value(id, T![||], "::math::or"),
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
