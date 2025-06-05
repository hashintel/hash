use core::iter;

use super::{
    ModuleId, ModuleRegistry, PartialModule,
    item::{ConstructorItem, IntrinsicTypeItem, IntrinsicValueItem, Item, ItemKind},
    locals::TypeDef,
};
use crate::{
    collection::SmallVec,
    heap::Heap,
    symbol::Symbol,
    r#type::{
        TypeId,
        builder::TypeBuilder,
        environment::Environment,
        kind::generic::{GenericArgumentId, GenericArgumentReference},
    },
};

/// Declares a generic function type with parameters and return type.
///
/// Syntax: `<generics>(params) -> return_type`
/// - `generics`: Optional generic type parameters with optional bounds
/// - `params`: Function parameters with their type bounds
/// - `return_type`: The return type expression
///
/// Creates a closure type that can be generic if type parameters are specified.
macro_rules! decl {
    ($this:ident; <$($generic:ident $(: $generic_bound:ident)?),*>($($param:ident: $param_bound:expr),*) -> $return:expr) => {{
        $(
            #[expect(non_snake_case)]
            let ${concat($generic, _arg)} = $this.ty.fresh_argument(stringify!($generic));
            #[expect(non_snake_case)]
            let ${concat($generic, _ref)} = $this.ty.hydrate_argument(${concat($generic, _arg)});
            #[expect(non_snake_case)]
            let $generic = $this.ty.param(${concat($generic, _arg)});
        )*

        let mut closure = $this.ty.closure([$($param_bound),*], $return);
        if ${count($generic)} > 0 {
            closure = $this.ty.generic([
                $(
                    (${concat($generic, _arg)}, None $(.or(Some($generic_bound)))?)
                ),*
            ] as [(GenericArgumentId, Option<TypeId>); ${count($generic)}], closure)
        }

        $this.type_def(closure, &[$(${concat($generic, _ref)}),*])
    }};
}

pub(super) struct StandardLibrary<'env, 'heap> {
    heap: &'heap Heap,
    registry: &'env ModuleRegistry<'heap>,
    environment: &'env Environment<'heap>,
    ty: TypeBuilder<'env, 'heap>,
}

impl<'env, 'heap> StandardLibrary<'env, 'heap> {
    pub(super) fn new(
        environment: &'env Environment<'heap>,
        registry: &'env ModuleRegistry<'heap>,
    ) -> Self {
        Self {
            heap: environment.heap,
            registry,
            environment,
            ty: TypeBuilder::synthetic(environment),
        }
    }

    fn item(
        module: ModuleId,
        name: Symbol<'heap>,
        kind: impl Into<ItemKind<'heap>>,
    ) -> Item<'heap> {
        Item {
            module,
            name,
            kind: kind.into(),
        }
    }

    fn alloc_intrinsic_value(
        &self,
        module: ModuleId,
        name: &'static str,
        alias: impl IntoIterator<Item = &'static str>,
        r#type: TypeDef<'heap>,
    ) -> impl IntoIterator<Item = Item<'heap>> {
        let ident = name.rsplit_once("::").expect("path should be non-empty").1;

        iter::once(ident).chain(alias).map(move |ident| {
            Self::item(
                module,
                self.heap.intern_symbol(ident),
                IntrinsicValueItem { name, r#type },
            )
        })
    }

    fn alloc_intrinsic_type(
        &self,
        parent: ModuleId,
        name: &'static str,
        alias: impl IntoIterator<Item = &'static str>,
    ) -> impl IntoIterator<Item = Item<'heap>> {
        let ident = name.rsplit_once("::").expect("path should be non-empty").1;

        iter::once(ident).chain(alias).map(move |ident| {
            Self::item(
                parent,
                self.heap.intern_symbol(ident),
                IntrinsicTypeItem { name },
            )
        })
    }

    fn alloc_ctor(
        &self,
        module: ModuleId,
        name: &'static str,
        r#type: TypeDef<'heap>,
    ) -> Item<'heap> {
        Self::item(
            module,
            self.heap.intern_symbol(name),
            ConstructorItem { r#type },
        )
    }

    fn type_def(
        &self,
        r#type: TypeId,
        arguments: &[GenericArgumentReference<'heap>],
    ) -> TypeDef<'heap> {
        TypeDef {
            id: r#type,
            arguments: self
                .environment
                .intern_generic_argument_references(arguments),
        }
    }

    fn alloc_type_item(
        &self,
        parent: ModuleId,
        name: &'static str,
        r#type: TypeDef<'heap>,
    ) -> Item<'heap> {
        Self::item(parent, self.heap.intern_symbol(name), r#type)
    }

    fn kernel_special_form_module(&self, parent: ModuleId) -> ModuleId {
        self.registry.intern_module(|id| {
            let id = id.value();

            let make = |name: &'static str, alias: &'static [&'static str]| {
                self.alloc_intrinsic_value(
                    id,
                    name,
                    alias.iter().copied(),
                    self.type_def(self.ty.never(), &[]),
                )
            };

            let mut items = smallvec::SmallVec::<_, 12>::new();
            items.extend(
                [
                    make("::kernel::special_form::if", &[]),
                    make("::kernel::special_form::is", &[]),
                    make("::kernel::special_form::let", &[]),
                    make("::kernel::special_form::type", &[]),
                    make("::kernel::special_form::newtype", &[]),
                    make("::kernel::special_form::use", &[]),
                    make("::kernel::special_form::fn", &[]),
                    make("::kernel::special_form::input", &[]),
                    make("::kernel::special_form::access", &["."]),
                    make("::kernel::special_form::index", &["[]"]),
                ]
                .into_iter()
                .flatten(),
            );

            PartialModule {
                name: self.heap.intern_symbol("special_form"),
                parent,
                items: self.registry.intern_items(&items),
            }
        })
    }

    fn kernel_type_module_primitives(&self, parent: ModuleId, items: &mut Vec<Item<'heap>>) {
        items.extend_from_slice(&[
            self.alloc_type_item(parent, "Boolean", self.type_def(self.ty.boolean(), &[])),
            self.alloc_type_item(parent, "Null", self.type_def(self.ty.null(), &[])),
            self.alloc_type_item(parent, "Number", self.type_def(self.ty.number(), &[])),
            self.alloc_type_item(parent, "Integer", self.type_def(self.ty.integer(), &[])),
            // Natural does not yet exist, due to lack of support for refinements
            self.alloc_type_item(parent, "String", self.type_def(self.ty.string(), &[])),
        ]);
    }

    fn kernel_type_module_boundary(&self, parent: ModuleId, items: &mut Vec<Item<'heap>>) {
        items.extend_from_slice(&[
            self.alloc_type_item(parent, "Unknown", self.type_def(self.ty.unknown(), &[])),
            self.alloc_type_item(parent, "Never", self.type_def(self.ty.never(), &[])),
            self.alloc_type_item(parent, "?", self.type_def(self.ty.unknown(), &[])),
            self.alloc_type_item(parent, "!", self.type_def(self.ty.never(), &[])),
        ]);
    }

    fn kernel_type_module_intrinsics(&self, parent: ModuleId, items: &mut Vec<Item<'heap>>) {
        // Struct/Tuple are purposefully excluded, as they are
        // fundamental types and do not have any meaningful value constructors.
        // Union and Intersections are also excluded, as they have explicit constructors.
        items.extend(
            [
                self.alloc_intrinsic_type(parent, "::kernel::type::List", None),
                self.alloc_intrinsic_type(parent, "::kernel::type::Dict", None),
            ]
            .into_iter()
            .flatten(),
        );
    }

    fn kernel_type_module(&self, parent: ModuleId) -> ModuleId {
        self.registry.intern_module(|id| {
            let id = id.value();

            let mut items = Vec::with_capacity(64);
            self.kernel_type_module_primitives(id, &mut items);
            self.kernel_type_module_boundary(id, &mut items);
            self.kernel_type_module_intrinsics(id, &mut items);

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

    fn core_url_module(&self, parent: ModuleId) -> ModuleId {
        self.registry.intern_module(|id| {
            let id = id.value();

            let url = self.ty.opaque("::core::url::Url", self.ty.string());
            let url = self.type_def(url, &[]);

            let base_url = self.ty.opaque("::core::url::BaseUrl", url.id);
            let base_url = self.type_def(base_url, &[]);

            PartialModule {
                name: self.heap.intern_symbol("url"),
                parent,
                items: self.registry.intern_items(&[
                    self.alloc_type_item(id, "Url", url),
                    self.alloc_ctor(id, "Url", url),
                    self.alloc_type_item(id, "BaseUrl", base_url),
                    self.alloc_ctor(id, "BaseUrl", base_url),
                ]),
            }
        })
    }

    fn core_option_module(&mut self, parent: ModuleId) -> ModuleId {
        self.registry.intern_module(|id| {
            let id = id.value();

            // Option is simply a union between two opaque types, when the constructor only takes a
            // `Null` the constructor automatically allows for no-value.
            let generic = self.ty.fresh_argument("T");

            let none = self.ty.opaque("::core::option::None", self.ty.null());
            let none = self.type_def(none, &[]);

            let some = self.ty.generic(
                [(generic, None)],
                self.ty
                    .opaque("::core::option::Some", self.ty.param(generic)),
            );
            let some = self.type_def(some, &[self.ty.hydrate_argument(generic)]);

            let option = self.ty.union([some.id, none.id]);
            let option = self.type_def(option, &[self.ty.hydrate_argument(generic)]);

            PartialModule {
                name: self.heap.intern_symbol("option"),
                parent,
                items: self.registry.intern_items(&[
                    self.alloc_type_item(id, "None", none),
                    self.alloc_ctor(id, "None", none),
                    self.alloc_type_item(id, "Some", some),
                    self.alloc_ctor(id, "Some", some),
                    self.alloc_type_item(id, "Option", option),
                ]),
            }
        })
    }

    fn core_result_module(&mut self, parent: ModuleId) -> ModuleId {
        self.registry.intern_module(|id| {
            let id = id.value();

            let t_arg = self.ty.fresh_argument("T");
            let t_ref = self.ty.hydrate_argument(t_arg);

            let e_arg = self.ty.fresh_argument("E");
            let e_ref = self.ty.hydrate_argument(e_arg);

            let ok = self.ty.generic(
                [(t_arg, None)],
                self.ty.opaque("::core::result::Ok", self.ty.param(t_arg)),
            );
            let ok = self.type_def(ok, &[t_ref]);

            let err = self.ty.generic(
                [(e_arg, None)],
                self.ty.opaque("::core::result::Err", self.ty.param(e_arg)),
            );
            let err = self.type_def(err, &[e_ref]);

            let result = self.ty.union([ok.id, err.id]);
            let result = self.type_def(result, &[t_ref, e_ref]);

            PartialModule {
                name: self.heap.intern_symbol("result"),
                parent,
                items: self.registry.intern_items(&[
                    self.alloc_type_item(id, "Ok", ok),
                    self.alloc_ctor(id, "Ok", ok),
                    self.alloc_type_item(id, "Err", err),
                    self.alloc_ctor(id, "Err", err),
                    self.alloc_type_item(id, "Result", result),
                ]),
            }
        })
    }

    #[expect(clippy::non_ascii_literal, clippy::min_ident_chars, non_snake_case)]
    fn core_math_module(&mut self, parent: ModuleId) -> ModuleId {
        self.registry.intern_module(|id| {
            let id = id.value();

            let Number = self.ty.number();
            let Integer = self.ty.integer();

            let items = [
                (
                    "::core::math::add",
                    &["+"] as &[&'static str],
                    decl!(self; <T: Number, U: Number>(lhs: T, rhs: U) -> self.ty.union([T, U])),
                ),
                (
                    "::core::math::sub",
                    &["-"],
                    decl!(self; <T: Number, U: Number>(lhs: T, rhs: U) -> self.ty.union([T, U])),
                ),
                (
                    "::core::math::mul",
                    &["*"],
                    decl!(self; <T: Number, U: Number>(lhs: T, rhs: U) -> self.ty.union([T, U])),
                ),
                (
                    "::core::math::div",
                    &["/"],
                    decl!(self; <>(dividend: Number, divisor: Number) -> Number),
                ),
                (
                    "::core::math::rem",
                    &["%"],
                    decl!(self; <>(dividend: Integer, divisor: Integer) -> Integer),
                ),
                (
                    "::core::math::mod",
                    &[],
                    decl!(self; <>(value: Integer, modulus: Integer) -> Integer),
                ),
                (
                    "::core::math::pow",
                    &["**", "↑"],
                    // (cannot be `Integer` on return, as `exponent` can be a negative integer)
                    decl!(self; <>(base: Number, exponent: Number) -> Number),
                ),
                (
                    "::core::math::sqrt",
                    &["√"],
                    decl!(self; <>(value: Number) -> Number),
                ),
                (
                    "::core::math::cbrt",
                    &["∛"],
                    decl!(self; <>(value: Number) -> Number),
                ),
                (
                    "::core::math::root",
                    &[], // cannot use `ⁿ√` because `ⁿ` is a letter, not a symbol
                    decl!(self; <>(value: Number, root: Number) -> Number),
                ),
            ];

            let items: SmallVec<_> = items
                .iter()
                .flat_map(|(name, alias, def)| {
                    self.alloc_intrinsic_value(id, name, alias.iter().copied(), *def)
                })
                .collect();

            PartialModule {
                name: self.heap.intern_symbol("math"),
                parent,
                items: self.registry.intern_items(&items),
            }
        })
    }

    #[expect(non_snake_case)]
    fn core_bits_module(&self, parent: ModuleId) -> ModuleId {
        self.registry.intern_module(|id| {
            let Integer = self.ty.integer();

            let items = [
                (
                    "::core::bits::and",
                    &["&"],
                    decl!(self; <>(lhs: Integer, rhs: Integer) -> Integer),
                ),
                (
                    "::core::bits::or",
                    &["|"],
                    decl!(self; <>(lhs: Integer, rhs: Integer) -> Integer),
                ),
                (
                    "::core::bits::xor",
                    &["^"],
                    decl!(self; <>(lhs: Integer, rhs: Integer) -> Integer),
                ),
                (
                    "::core::bits::not",
                    &["~"],
                    decl!(self; <>(value: Integer) -> Integer),
                ),
                (
                    "::core::bits::shl",
                    &["<<"],
                    // In the future we might want to specialize the `shift` to `Natural`
                    decl!(self; <>(value: Integer, shift: Integer) -> Integer),
                ),
                (
                    "::core::bits::shr",
                    &[">>"],
                    // In the future we might want to specialize the `shift` to `Natural`
                    decl!(self; <>(value: Integer, shift: Integer) -> Integer),
                ),
            ];

            let items: SmallVec<_> = items
                .iter()
                .flat_map(|(name, alias, def)| {
                    self.alloc_intrinsic_value(id.value(), name, alias.iter().copied(), *def)
                })
                .collect();

            PartialModule {
                name: self.heap.intern_symbol("bits"),
                parent,
                items: self.registry.intern_items(&items),
            }
        })
    }

    #[expect(clippy::min_ident_chars, non_snake_case)]
    fn core_cmp_module(&mut self, parent: ModuleId) -> ModuleId {
        self.registry.intern_module(|id| {
            let Number = self.ty.number();
            let Boolean = self.ty.boolean();

            let items = [
                (
                    "::core::cmp::gt",
                    &[">"],
                    decl!(self; <>(lhs: Number, rhs: Number) -> Boolean),
                ),
                (
                    "::core::cmp::lt",
                    &["<"],
                    decl!(self; <>(lhs: Number, rhs: Number) -> Boolean),
                ),
                (
                    "::core::cmp::gte",
                    &[">="],
                    decl!(self; <>(lhs: Number, rhs: Number) -> Boolean),
                ),
                (
                    "::core::cmp::lte",
                    &["<="],
                    decl!(self; <>(lhs: Number, rhs: Number) -> Boolean),
                ),
                (
                    "::core::cmp::eq",
                    &["=="],
                    decl!(self; <T, U>(lhs: T, rhs: U) -> Boolean),
                ),
                (
                    "::core::cmp::ne",
                    &["!="],
                    decl!(self; <T, U>(lhs: T, rhs: U) -> Boolean),
                ),
            ];

            let items: SmallVec<_> = items
                .iter()
                .flat_map(|(name, alias, def)| {
                    self.alloc_intrinsic_value(id.value(), name, alias.iter().copied(), *def)
                })
                .collect();

            PartialModule {
                name: self.heap.intern_symbol("cmp"),
                parent,
                items: self.registry.intern_items(&items),
            }
        })
    }

    #[expect(non_snake_case)]
    fn core_bool_module(&self, parent: ModuleId) -> ModuleId {
        self.registry.intern_module(|id| {
            let Boolean = self.ty.boolean();

            let items = [
                (
                    "::core::bool::not",
                    &["!"],
                    decl!(self; <>(value: Boolean) -> Boolean),
                ),
                (
                    "::core::bool::and",
                    &["&&"],
                    decl!(self; <>(lhs: Boolean, rhs: Boolean) -> Boolean),
                ),
                (
                    "::core::bool::or",
                    &["||"],
                    decl!(self; <>(lhs: Boolean, rhs: Boolean) -> Boolean),
                ),
            ];

            let items: SmallVec<_> = items
                .iter()
                .flat_map(|(name, alias, def)| {
                    self.alloc_intrinsic_value(id.value(), name, alias.iter().copied(), *def)
                })
                .collect();

            PartialModule {
                name: self.heap.intern_symbol("bool"),
                parent,
                items: self.registry.intern_items(&items),
            }
        })
    }

    fn core_module(&mut self) -> ModuleId {
        self.registry.intern_module(|id| PartialModule {
            name: self.heap.intern_symbol("core"),
            parent: ModuleId::ROOT,
            items: self.registry.intern_items(&[
                Item {
                    module: id.value(),
                    name: self.heap.intern_symbol("bits"),
                    kind: self.core_bits_module(id.value()).into(),
                },
                Item {
                    module: id.value(),
                    name: self.heap.intern_symbol("math"),
                    kind: self.core_math_module(id.value()).into(),
                },
                Item {
                    module: id.value(),
                    name: self.heap.intern_symbol("cmp"),
                    kind: self.core_cmp_module(id.value()).into(),
                },
                Item {
                    module: id.value(),
                    name: self.heap.intern_symbol("bool"),
                    kind: self.core_bool_module(id.value()).into(),
                },
                Item {
                    module: id.value(),
                    name: self.heap.intern_symbol("url"),
                    kind: self.core_url_module(id.value()).into(),
                },
                Item {
                    module: id.value(),
                    name: self.heap.intern_symbol("option"),
                    kind: self.core_option_module(id.value()).into(),
                },
                Item {
                    module: id.value(),
                    name: self.heap.intern_symbol("result"),
                    kind: self.core_result_module(id.value()).into(),
                },
            ]),
        })
    }

    pub(super) fn register(&mut self) {
        self.registry.register(self.kernel_module());
        self.registry.register(self.core_module());

        // TODO: The graph module is not yet added (Primarily due to the fact that we're not yet
        // sure about the shape of some of the types involved).
    }
}
