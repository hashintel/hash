use hashql_core::{
    heap::{PhaseAllocator as _, ScopeAllocator},
    r#type::{
        self, TypeId,
        environment::LatticeEnvironment,
        kind::{PrimitiveType, TypeKind, UnionType},
    },
    value::Primitive,
};

use super::{Node, data, kind::NodeKind};

/// An HIR [`Node`] restricted to data values.
///
/// Every node in a `Value` tree has kind [`NodeKind::Data`], covering primitive literals,
/// structs, dictionaries, tuples, and lists without variables, bindings, operations, control
/// flow, or graph reads.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct Value<'heap>(Node<'heap>);

impl<'heap> Value<'heap> {
    /// Constructs a [`Value`] from a [`Node`] known to contain only [`NodeKind::Data`] nodes.
    ///
    /// Every node reachable from `node` must have kind [`NodeKind::Data`].
    #[inline]
    pub(crate) fn new_unchecked(node: Node<'heap>) -> Self {
        #[cfg(debug_assertions)]
        Self::debug_assert_integrity(node);

        Self(node)
    }

    /// Returns the interned [`Node`] representing this value.
    #[inline]
    #[must_use]
    pub const fn node(self) -> Node<'heap> {
        self.0
    }

    /// Computes the type of this value from its literals.
    ///
    /// The element type of a list is the union of the types of its elements. A dictionary takes the
    /// union of the types of its keys and the union of the types of its values in the same way. The
    /// union of no types is `!`, which makes it the element type of an empty list and the key and
    /// value type of an empty dictionary.
    pub fn r#type<'alloc, S>(
        self,
        env: &mut LatticeEnvironment<'_, 'heap>,
        mut scratch: S,
    ) -> TypeId
    where
        S: ScopeAllocator<'alloc>,
        'heap: 'alloc,
    {
        let NodeKind::Data(data) = &self.0.kind else {
            unreachable!("Value may only contain data nodes")
        };

        let kind = match data {
            data::Data::Primitive(primitive) => TypeKind::Primitive(match primitive {
                Primitive::Boolean(_) => PrimitiveType::Boolean,
                Primitive::Float(_) => PrimitiveType::Number,
                Primitive::Integer(_) => PrimitiveType::Integer,
                Primitive::String(_) => PrimitiveType::String,
                Primitive::Null => PrimitiveType::Null,
            }),
            data::Data::Struct(data::Struct { fields }) => {
                let out = scratch
                    .alloc_slice_uninit::<r#type::kind::r#struct::StructField<'heap>>(fields.len());

                let (fields, rest) = out.write_iter(fields.iter().map(|field| {
                    let r#type = scratch.scoped(|scope| Self(field.value).r#type(env, scope));

                    r#type::kind::r#struct::StructField {
                        name: field.name.value,
                        value: r#type,
                    }
                }));
                debug_assert!(rest.is_empty());

                let fields = env.intern_struct_fields(fields).unwrap_or_else(|_err| {
                    unreachable!("struct values should already be well-formed")
                });

                TypeKind::Struct(r#type::kind::StructType { fields })
            }
            data::Data::Tuple(data::Tuple { fields }) => {
                let out = scratch.alloc_slice_uninit::<r#type::TypeId>(fields.len());

                let (fields, rest) = out.write_iter(
                    fields
                        .iter()
                        .map(|&field| scratch.scoped(|scope| Self(field).r#type(env, scope))),
                );
                debug_assert!(rest.is_empty());

                let fields = env.intern_type_ids(fields);
                TypeKind::Tuple(r#type::kind::TupleType { fields })
            }
            data::Data::Dict(data::Dict { fields }) => {
                let out_key = scratch.alloc_slice_uninit::<r#type::TypeId>(fields.len());
                let out_value = scratch.alloc_slice_uninit::<r#type::TypeId>(fields.len());

                let (keys, rest) =
                    out_key.write_iter(fields.iter().map(|&data::DictField { key, value: _ }| {
                        scratch.scoped(|scope| Self(key).r#type(env, scope))
                    }));
                debug_assert!(rest.is_empty());
                let keys = env.intern_type_ids(keys);

                let (values, rest) = out_value.write_iter(fields.iter().map(
                    |&data::DictField { key: _, value }| {
                        scratch.scoped(|scope| Self(value).r#type(env, scope))
                    },
                ));
                debug_assert!(rest.is_empty());
                let values = env.intern_type_ids(values);

                let key = TypeKind::Union(UnionType { variants: keys });
                let value = TypeKind::Union(UnionType { variants: values });

                let key = env.intern_type(r#type::PartialType {
                    span: self.0.span,
                    kind: env.intern_kind(key),
                });
                let key = env.simplify(key);

                let value = env.intern_type(r#type::PartialType {
                    span: self.0.span,
                    kind: env.intern_kind(value),
                });
                let value = env.simplify(value);

                TypeKind::Intrinsic(r#type::kind::IntrinsicType::Dict(
                    r#type::kind::intrinsic::DictType { key, value },
                ))
            }
            data::Data::List(data::List { elements }) => {
                let out = scratch.alloc_slice_uninit::<r#type::TypeId>(elements.len());

                let (elements, rest) = out.write_iter(
                    elements
                        .iter()
                        .map(|&element| scratch.scoped(|scope| Self(element).r#type(env, scope))),
                );
                debug_assert!(rest.is_empty());
                let elements = env.intern_type_ids(elements);

                let element = TypeKind::Union(UnionType { variants: elements });
                let element = env.intern_type(r#type::PartialType {
                    span: self.0.span,
                    kind: env.intern_kind(element),
                });
                let element = env.simplify(element);

                TypeKind::Intrinsic(r#type::kind::IntrinsicType::List(
                    r#type::kind::intrinsic::ListType { element },
                ))
            }
        };

        env.intern_type(hashql_core::r#type::PartialType {
            span: self.0.span,
            kind: env.intern_kind(kind),
        })
    }

    #[cfg(debug_assertions)]
    #[inline(never)]
    pub(crate) fn debug_assert_integrity(node: Node<'_>) {
        match node.0.kind {
            NodeKind::Data(data::Data::Struct(data::Struct { fields })) => {
                for &data::StructField { name: _, value } in fields {
                    Self::debug_assert_integrity(value);
                }
            }
            NodeKind::Data(data::Data::Tuple(data::Tuple { fields })) => {
                for &value in fields {
                    Self::debug_assert_integrity(value);
                }
            }
            NodeKind::Data(data::Data::Dict(data::Dict { fields })) => {
                for &data::DictField { key, value } in fields {
                    Self::debug_assert_integrity(key);
                    Self::debug_assert_integrity(value);
                }
            }
            NodeKind::Data(data::Data::List(data::List { elements })) => {
                for &value in elements {
                    Self::debug_assert_integrity(value);
                }
            }
            NodeKind::Data(data::Data::Primitive(_)) => {}
            NodeKind::Variable(_)
            | NodeKind::Let(_)
            | NodeKind::Operation(_)
            | NodeKind::Access(_)
            | NodeKind::Call(_)
            | NodeKind::Branch(_)
            | NodeKind::Closure(_)
            | NodeKind::Thunk(_)
            | NodeKind::Graph(_) => {
                panic!("expected data")
            }
        }
    }
}
