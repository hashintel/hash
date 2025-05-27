use super::{
    ModuleId, ModuleRegistry, PartialModule,
    item::{IntrinsicItem, IntrinsicValue, Item, ItemKind},
    universe::Universe,
};
use crate::{
    heap::Heap,
    r#type::{
        TypeId, build::TypeBuilder, environment::Environment,
        kind::generic::GenericArgumentReference,
    },
};

pub(super) struct StandardLibrary<'env, 'heap> {
    heap: &'heap Heap,
    registry: &'env ModuleRegistry<'heap>,
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
            ty: TypeBuilder::synthetic(environment),
        }
    }

    fn alloc_intrinsic_value(
        &self,
        parent: ModuleId,
        name: &'static str,
        alias: Option<&str>,
        r#type: TypeId,
    ) -> Item<'heap> {
        let ident =
            alias.unwrap_or_else(|| name.rsplit_once("::").expect("path should be non-empty").1);
        let ident = self.heap.intern_symbol(ident);

        Item {
            module: parent,
            name: ident,
            kind: ItemKind::Intrinsic(IntrinsicItem::Value(IntrinsicValue { name, r#type })),
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

    fn alloc_type_item(
        &self,
        parent: ModuleId,
        name: &'static str,
        kind: TypeId,
        generics: &[GenericArgumentReference<'heap>],
    ) -> Item<'heap> {
        Item {
            module: parent,
            name: self.heap.intern_symbol(name),
            kind: ItemKind::Type(kind, self.heap.slice(generics)),
        }
    }

    fn kernel_special_form_module(&self, parent: ModuleId) -> ModuleId {
        self.registry.intern_module(|id| {
            let id = id.value();

            let make = |name: &'static str, alias: Option<&'static str>| {
                self.alloc_intrinsic_value(id, name, alias, self.ty.never())
            };

            let items = [
                make("::kernel::special_form::if", None),
                make("::kernel::special_form::is", None),
                make("::kernel::special_form::let", None),
                make("::kernel::special_form::type", None),
                make("::kernel::special_form::newtype", None),
                make("::kernel::special_form::use", None),
                make("::kernel::special_form::fn", None),
                make("::kernel::special_form::input", None),
                make("::kernel::special_form::access", Some(".")),
                make("::kernel::special_form::access", None),
                make("::kernel::special_form::index", Some("[]")),
                make("::kernel::special_form::index", None),
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
            self.alloc_type_item(parent, "Boolean", self.ty.boolean(), &[]),
            self.alloc_type_item(parent, "Null", self.ty.null(), &[]),
            self.alloc_type_item(parent, "Number", self.ty.number(), &[]),
            self.alloc_type_item(parent, "Integer", self.ty.integer(), &[]),
            // Natural does not yet exist, due to lack of support for refinements
            self.alloc_type_item(parent, "String", self.ty.string(), &[]),
        ]);
    }

    fn kernel_type_module_boundary(&self, parent: ModuleId, items: &mut Vec<Item<'heap>>) {
        items.extend_from_slice(&[
            self.alloc_type_item(parent, "Unknown", self.ty.unknown(), &[]),
            self.alloc_type_item(parent, "Never", self.ty.never(), &[]),
            self.alloc_type_item(parent, "?", self.ty.unknown(), &[]),
            self.alloc_type_item(parent, "!", self.ty.never(), &[]),
        ]);
    }

    fn kernel_type_module_intrinsics(&self, parent: ModuleId, items: &mut Vec<Item<'heap>>) {
        // Struct/Tuple are purposefully excluded, as they are
        // fundamental types and do not have any meaningful value constructors.
        // Union and Type only have constructors for their respective types, but no meaningful
        // types.
        items.extend_from_slice(&[
            self.alloc_intrinsic_type(parent, "::kernel::type::List", None),
            self.alloc_intrinsic_type(parent, "::kernel::type::Dict", None),
        ]);
    }

    fn kernel_type_module_opaque(&self, parent: ModuleId, items: &mut Vec<Item<'heap>>) {
        let url = self.ty.opaque("::kernel::type::Url", self.ty.string());
        let base_url = self.ty.opaque("::kernel::type::BaseUrl", url);

        // The intrinsics that are registered correspond to the constructor functions, in
        // the future we should replace these with proper functions instead of using
        // intrinsics.
        // see: https://linear.app/hash/issue/H-4451/hashql-prelude-opaque-type-constructors-should-be-alone-standing
        items.extend_from_slice(&[
            self.alloc_type_item(parent, "Url", url, &[]),
            // TODO: that's a ctor
            self.alloc_intrinsic_value(parent, "::kernel::type::Url", None),
            self.alloc_type_item(parent, "BaseUrl", base_url, &[]),
            self.alloc_intrinsic_value(parent, "::kernel::type::BaseUrl", None),
        ]);
    }

    fn kernel_type_module_option(&self, parent: ModuleId, items: &mut Vec<Item<'heap>>) {
        // Option is simply a union between two opaque types, when the constructor only takes a
        // `Null` the constructor automatically allows for no-value.
        let generic = self.ty.argument("T");

        let none = self.ty.opaque("::kernel::type::None", self.ty.null());
        let some = self.ty.generic(
            [(generic, None)],
            self.ty
                .opaque("::kernel::type::Some", self.ty.param(generic)),
        );

        let option = self.ty.union([some, none]);

        items.extend_from_slice(&[
            self.alloc_type_item(parent, "None", none, &[]),
            // TODO: that's a ctor
            self.alloc_intrinsic_value(parent, "::kernel::type::None", None),
            self.alloc_type_item(parent, "Some", some, &[self.ty.arg_ref(generic)]),
            self.alloc_intrinsic_value(parent, "::kernel::type::Some", None),
            self.alloc_type_item(parent, "Option", option, &[self.ty.arg_ref(generic)]),
        ]);
    }

    fn kernel_type_module_result(&self, parent: ModuleId, items: &mut Vec<Item<'heap>>) {
        let t_arg = self.ty.argument("T");
        let e_arg = self.ty.argument("E");

        let ok = self.ty.generic(
            [(t_arg, None)],
            self.ty.opaque("::kernel::type::Ok", self.ty.param(t_arg)),
        );
        let err = self.ty.generic(
            [(e_arg, None)],
            self.ty.opaque("::kernel::type::Err", self.ty.param(e_arg)),
        );

        let result = self.ty.union([ok, err]);

        let t_arg = self.ty.arg_ref(t_arg);
        let e_arg = self.ty.arg_ref(e_arg);

        items.extend_from_slice(&[
            self.alloc_type_item(parent, "Ok", ok, &[t_arg]),
            self.alloc_intrinsic_value(parent, "::kernel::type::Ok", None),
            self.alloc_type_item(parent, "Err", err, &[e_arg]),
            self.alloc_intrinsic_value(parent, "::kernel::type::Err", None),
            self.alloc_type_item(parent, "Result", result, &[t_arg, e_arg]),
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

    #[expect(clippy::non_ascii_literal)]
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
                    // Remainder
                    self.alloc_intrinsic_value(id, "::math::rem", None),
                    self.alloc_intrinsic_value(id, "::math::rem", Some("%")),
                    // Modulo
                    self.alloc_intrinsic_value(id, "::math::mod", None),
                    // Power
                    self.alloc_intrinsic_value(id, "::math::pow", None),
                    self.alloc_intrinsic_value(id, "::math::pow", Some("**")),
                    self.alloc_intrinsic_value(id, "::math::pow", Some("↑")),
                    // Square root
                    self.alloc_intrinsic_value(id, "::math::sqrt", None),
                    self.alloc_intrinsic_value(id, "::math::sqrt", Some("√")),
                    // Cube Root
                    self.alloc_intrinsic_value(id, "::math::cbrt", None),
                    self.alloc_intrinsic_value(id, "::math::cbrt", Some("∛")),
                    // Arbitrary Root
                    self.alloc_intrinsic_value(id, "::math::root", None),
                    // Bitwise operations
                    self.alloc_intrinsic_value(id, "::math::bit_and", None),
                    self.alloc_intrinsic_value(id, "::math::bit_and", Some("&")),
                    self.alloc_intrinsic_value(id, "::math::bit_or", None),
                    self.alloc_intrinsic_value(id, "::math::bit_or", Some("|")),
                    self.alloc_intrinsic_value(id, "::math::bit_xor", None),
                    self.alloc_intrinsic_value(id, "::math::bit_xor", Some("^")),
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
