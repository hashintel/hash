use core::iter;

use arrayvec::ArrayVec;

use super::{
    ModuleId, ModuleRegistry, PartialModule,
    item::{ConstructorItem, IntrinsicType, IntrinsicValue, Item, ItemKind},
    locals::TypeDef,
};
use crate::{
    heap::Heap,
    symbol::Symbol,
    r#type::{
        TypeId,
        builder::TypeBuilder,
        environment::Environment,
        kind::generic::{GenericArgumentId, GenericArgumentReference},
    },
};

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
                IntrinsicValue { name, r#type },
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
                IntrinsicType { name },
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

            let mut items = ArrayVec::<_, 12>::new();
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

    fn kernel_type_module_opaque(&self, parent: ModuleId, items: &mut Vec<Item<'heap>>) {
        let url = self.ty.opaque("::kernel::type::Url", self.ty.string());
        let url = self.type_def(url, &[]);

        let base_url = self.ty.opaque("::kernel::type::BaseUrl", url.id);
        let base_url = self.type_def(base_url, &[]);

        items.extend_from_slice(&[
            self.alloc_type_item(parent, "Url", url),
            self.alloc_ctor(parent, "Url", url),
            self.alloc_type_item(parent, "BaseUrl", base_url),
            self.alloc_ctor(parent, "BaseUrl", base_url),
        ]);
    }

    fn kernel_type_module_option(&mut self, parent: ModuleId, items: &mut Vec<Item<'heap>>) {
        // Option is simply a union between two opaque types, when the constructor only takes a
        // `Null` the constructor automatically allows for no-value.
        let generic = self.ty.fresh_argument("T");

        let none = self.ty.opaque("::kernel::type::None", self.ty.null());
        let none = self.type_def(none, &[]);

        let some = self.ty.generic(
            [(generic, None)],
            self.ty
                .opaque("::kernel::type::Some", self.ty.param(generic)),
        );
        let some = self.type_def(some, &[self.ty.hydrate_argument(generic)]);

        let option = self.ty.union([some.id, none.id]);
        let option = self.type_def(option, &[self.ty.hydrate_argument(generic)]);

        items.extend_from_slice(&[
            self.alloc_type_item(parent, "None", none),
            self.alloc_ctor(parent, "None", none),
            self.alloc_type_item(parent, "Some", some),
            self.alloc_ctor(parent, "Some", some),
            self.alloc_type_item(parent, "Option", option),
        ]);
    }

    fn kernel_type_module_result(&mut self, parent: ModuleId, items: &mut Vec<Item<'heap>>) {
        let t_arg = self.ty.fresh_argument("T");
        let t_ref = self.ty.hydrate_argument(t_arg);

        let e_arg = self.ty.fresh_argument("E");
        let e_ref = self.ty.hydrate_argument(e_arg);

        let ok = self.ty.generic(
            [(t_arg, None)],
            self.ty.opaque("::kernel::type::Ok", self.ty.param(t_arg)),
        );
        let ok = self.type_def(ok, &[t_ref]);

        let err = self.ty.generic(
            [(e_arg, None)],
            self.ty.opaque("::kernel::type::Err", self.ty.param(e_arg)),
        );
        let err = self.type_def(err, &[e_ref]);

        let result = self.ty.union([ok.id, err.id]);
        let result = self.type_def(result, &[t_ref, e_ref]);

        items.extend_from_slice(&[
            self.alloc_type_item(parent, "Ok", ok),
            self.alloc_ctor(parent, "Ok", ok),
            self.alloc_type_item(parent, "Err", err),
            self.alloc_ctor(parent, "Err", err),
            self.alloc_type_item(parent, "Result", result),
        ]);
    }

    fn kernel_type_module(&mut self, parent: ModuleId) -> ModuleId {
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

    fn kernel_module(&mut self) -> ModuleId {
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

    #[expect(
        clippy::non_ascii_literal,
        clippy::too_many_lines,
        clippy::min_ident_chars,
        non_snake_case
    )]
    fn math_module(&mut self) -> ModuleId {
        macro_rules! decl {
            (<$($generic:ident $(: $generic_bound:ident)?),*>($($param:ident: $param_bound:expr),*) -> $return:expr) => {{
                $(
                    #[expect(non_snake_case)]
                    let ${concat($generic, _arg)} = self.ty.fresh_argument(stringify!($generic));
                    #[expect(non_snake_case)]
                    let ${concat($generic, _ref)} = self.ty.hydrate_argument(${concat($generic, _arg)});
                    #[expect(non_snake_case)]
                    let $generic = self.ty.param(${concat($generic, _arg)});
                )*

                let mut closure = self.ty.closure([$($param_bound),*], $return);
                if ${count($generic)} > 0 {
                    closure = self.ty.generic([
                        $(
                            (${concat($generic, _arg)}, None $(.or(Some($generic_bound)))?)
                        ),*
                    ] as [(GenericArgumentId, Option<TypeId>); ${count($generic)}], closure)
                }

                self.type_def(closure, &[$(${concat($generic, _ref)}),*])
            }};
        }

        self.registry.intern_module(|id| {
            let id = id.value();

            let Number = self.ty.number();
            let Integer = self.ty.integer();
            let Boolean = self.ty.boolean();

            // Arithmetic
            let funcs = &[
                (
                    "::math::add",
                    &["+"] as &[&'static str],
                    decl!(<T: Number, U: Number>(lhs: T, rhs: U) -> self.ty.union([T, U])),
                ),
                (
                    "::math::sub",
                    &["-"],
                    decl!(<T: Number, U: Number>(lhs: T, rhs: U) -> self.ty.union([T, U])),
                ),
                (
                    "::math::mul",
                    &["*"],
                    decl!(<T: Number, U: Number>(lhs: T, rhs: U) -> self.ty.union([T, U])),
                ),
                (
                    "::math::div",
                    &["/"],
                    decl!(<>(dividend: Number, divisor: Number) -> Number),
                ),
                (
                    "::math::rem",
                    &["%"],
                    decl!(<>(dividend: Integer, divisor: Integer) -> Integer),
                ),
                (
                    "::math::mod",
                    &[],
                    decl!(<>(value: Integer, modulus: Integer) -> Integer),
                ),
                (
                    "::math::pow",
                    &["**", "↑"],
                    // (cannot be `Integer` on return, as `exponent` can be a negative integer)
                    decl!(<>(base: Number, exponent: Number) -> Number),
                ),
                // Roots
                ("::math::sqrt", &["√"], decl!(<>(value: Number) -> Number)),
                ("::math::cbrt", &["∛"], decl!(<>(value: Number) -> Number)),
                (
                    "::math::root",
                    &[], // cannot use `ⁿ√` because `ⁿ` is a letter, not a symbol
                    decl!(<>(value: Number, root: Number) -> Number),
                ),
                // Bitwise operations
                (
                    "::math::bit_and",
                    &["&"],
                    decl!(<>(lhs: Integer, rhs: Integer) -> Integer),
                ),
                (
                    "::math::bit_or",
                    &["|"],
                    decl!(<>(lhs: Integer, rhs: Integer) -> Integer),
                ),
                (
                    "::math::bit_xor",
                    &["^"],
                    decl!(<>(lhs: Integer, rhs: Integer) -> Integer),
                ),
                (
                    "::math::bit_not",
                    &["~"],
                    decl!(<>(value: Integer) -> Integer),
                ),
                (
                    "::math::bit_shl",
                    &["<<"],
                    // In the future we might want to specialize the `shift` to `Natural`
                    decl!(<>(value: Integer, shift: Integer) -> Integer),
                ),
                (
                    "::math::bit_shr",
                    &[">>"],
                    // In the future we might want to specialize the `shift` to `Natural`
                    decl!(<>(value: Integer, shift: Integer) -> Integer),
                ),
                // Comparison operations
                (
                    "::math::gt",
                    &[">"],
                    decl!(<>(lhs: Number, rhs: Number) -> Boolean),
                ),
                (
                    "::math::lt",
                    &["<"],
                    decl!(<>(lhs: Number, rhs: Number) -> Boolean),
                ),
                (
                    "::math::gte",
                    &[">="],
                    decl!(<>(lhs: Number, rhs: Number) -> Boolean),
                ),
                (
                    "::math::lte",
                    &["<="],
                    decl!(<>(lhs: Number, rhs: Number) -> Boolean),
                ),
                (
                    "::math::eq",
                    &["=="],
                    decl!(<T, U>(lhs: T, rhs: U) -> Boolean),
                ),
                (
                    "::math::ne",
                    &["!="],
                    decl!(<T, U>(lhs: T, rhs: U) -> Boolean),
                ),
                // Logical operations
                ("::math::not", &["!"], decl!(<>(value: Boolean) -> Boolean)),
                (
                    "::math::and",
                    &["&&"],
                    decl!(<>(lhs: Boolean, rhs: Boolean) -> Boolean),
                ),
                (
                    "::math::or",
                    &["||"],
                    decl!(<>(lhs: Boolean, rhs: Boolean) -> Boolean),
                ),
            ];

            let items: Vec<_> = funcs
                .iter()
                .flat_map(|(name, alias, def)| {
                    self.alloc_intrinsic_value(id, name, alias.iter().copied(), *def)
                })
                .collect();

            PartialModule {
                name: self.heap.intern_symbol("math"),
                parent: ModuleId::ROOT,
                items: self.registry.intern_items(&items),
            }
        })
    }

    pub(super) fn register(&mut self) {
        self.registry.register(self.kernel_module());
        self.registry.register(self.math_module());

        // TODO: The graph module is not yet added (Primarily due to the fact that we're not yet
        // sure about the shape of some of the types involved).
    }
}
