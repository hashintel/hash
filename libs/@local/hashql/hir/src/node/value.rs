use core::alloc::Allocator;

use hashql_core::{
    heap::{BumpAllocator, CollectIn},
    r#type::{self, Type, TypeId, environment::Environment, kind::TypeKind},
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

    pub fn r#type<S: BumpAllocator>(self, env: &Environment<'heap>, scratch: &mut S) -> TypeId {
        let kind = match &self.0.kind {
            NodeKind::Data(data::Data::Primitive(Primitive::Boolean(_))) => {
                TypeKind::Primitive(hashql_core::r#type::kind::PrimitiveType::Boolean)
            }
            NodeKind::Data(data::Data::Primitive(Primitive::Float(_))) => {
                TypeKind::Primitive(hashql_core::r#type::kind::PrimitiveType::Number)
            }
            NodeKind::Data(data::Data::Primitive(Primitive::Integer(_))) => {
                TypeKind::Primitive(hashql_core::r#type::kind::PrimitiveType::Integer)
            }
            NodeKind::Data(data::Data::Primitive(Primitive::String(_))) => {
                TypeKind::Primitive(hashql_core::r#type::kind::PrimitiveType::String)
            }
            NodeKind::Data(data::Data::Primitive(Primitive::Null)) => {
                TypeKind::Primitive(hashql_core::r#type::kind::PrimitiveType::Null)
            }
            NodeKind::Data(data::Data::Struct(data::Struct { fields })) => {
                let out = scratch
                    .allocate_slice_uninit::<r#type::kind::r#struct::StructField<'heap>>(
                        fields.len(),
                    );

                let (fields, rest) = out.write_iter(fields.iter().map(|field| {
                    let r#type = scratch.scoped_mut(|scope| Self(field.value).r#type(env, scope));

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
            NodeKind::Data(data::Data::Tuple(data::Tuple { fields: _fields })) => {
                todo!()
            }
            NodeKind::Data(data::Data::Dict(data::Dict { fields: _fields })) => {
                todo!()
            }
            NodeKind::Data(data::Data::List(data::List {
                elements: _elements,
            })) => todo!(),
            _ => {
                unreachable!("Value may only contain data nodes")
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
