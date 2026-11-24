use alloc::rc::Rc;
use core::alloc::Allocator;

use hashql_core::{intern::InternSet, symbol::Symbol, value::Primitive};
use hashql_hir::node as hir;

use crate::interpret::value as mir;

fn reify_primitive<A: Allocator>(primitive: Primitive<'_>) -> mir::Value<'_, A> {
    match primitive {
        Primitive::Null => mir::Value::Unit,
        Primitive::Boolean(value) => mir::Value::Integer(mir::Int::from(value)),
        Primitive::Integer(integer) => mir::Int::try_from(integer).map_or_else(
            |_| mir::Value::Number(mir::Num::from(integer.as_f64())),
            mir::Value::Integer,
        ),
        Primitive::Float(float) => mir::Value::Number(mir::Num::from(float)),
        Primitive::String(string) => mir::Value::String(mir::Str::from(string)),
    }
}

fn reify_node<'heap, A, S>(
    node: hir::Node<'heap>,
    symbols: &InternSet<'heap, [Symbol<'heap>]>,
    alloc: &A,
    scratch: &S,
) -> mir::Value<'heap, A>
where
    A: Allocator + Clone,
    S: Allocator,
{
    let hir::kind::NodeKind::Data(data) = node.kind else {
        unreachable!("HIR value nodes only contain NodeKind::Data");
    };

    match data {
        hir::data::Data::Primitive(primitive) => reify_primitive(primitive),
        hir::data::Data::Tuple(hir::data::Tuple { fields }) if fields.is_empty() => {
            mir::Value::Unit
        }
        hir::data::Data::Tuple(hir::data::Tuple { fields }) => {
            let mut values = Vec::with_capacity_in(fields.len(), alloc.clone());
            for &field in fields {
                values.push(reify_node(field, symbols, alloc, scratch));
            }
            mir::Value::Tuple(mir::Tuple::new_unchecked(Rc::from(values)))
        }
        hir::data::Data::Struct(hir::data::Struct { fields }) => {
            let mut field_names = Vec::with_capacity_in(fields.len(), scratch);
            let mut values = Vec::with_capacity_in(fields.len(), alloc.clone());

            for &hir::data::StructField { name, value } in fields {
                field_names.push(name.value);
                values.push(reify_node(value, symbols, alloc, scratch));
            }

            debug_assert!(field_names.is_sorted());
            let interned_names = symbols.intern_slice(&field_names);
            let r#struct = mir::Struct::new(interned_names, values)
                .expect("HIR struct fields are sorted and match value count");
            mir::Value::Struct(r#struct)
        }
        hir::data::Data::List(hir::data::List { elements }) => {
            let mut list = mir::List::new();
            for &element in elements {
                list.push_back(reify_node(element, symbols, alloc, scratch));
            }
            mir::Value::List(list)
        }
        hir::data::Data::Dict(hir::data::Dict { fields }) => {
            let mut dict = mir::Dict::new();
            for &hir::data::DictField { key, value } in fields {
                let key = reify_node(key, symbols, alloc, scratch);
                let value = reify_node(value, symbols, alloc, scratch);
                dict.insert(key, value);
            }
            mir::Value::Dict(dict)
        }
    }
}

/// Converts a value-only HIR [`Value`](HirValue) into a runtime MIR [`Value`].
///
/// Struct field name slices are interned into `symbols`. Retained aggregate storage allocates in
/// `alloc`, and temporary field-name buffers allocate in `scratch`. Empty tuples lower to
/// [`Value::Unit`], and integers outside the `i128` range widen to [`Value::Number`].
#[must_use]
pub fn from_hir_value_in<'heap, A, S>(
    value: hir::Value<'heap>,
    symbols: &InternSet<'heap, [Symbol<'heap>]>,
    alloc: A,
    scratch: S,
) -> mir::Value<'heap, A>
where
    A: Allocator + Clone,
    S: Allocator,
{
    reify_node(value.node(), symbols, &alloc, &scratch)
}

#[cfg(test)]
mod tests {
    use alloc::alloc::Global;

    use hashql_core::{
        heap::{Heap, Scratch},
        span::SpanId,
        symbol::{Ident, IdentKind},
        value::{self, Primitive},
    };
    use hashql_hir::{
        intern::Interner as HirInterner,
        node::{
            HirId, Node, NodeData,
            data::{Data, Dict, DictField, List, Struct, StructField, Tuple},
            kind::NodeKind,
        },
    };

    use super::reify_node;
    use crate::{
        intern::Interner as MirInterner,
        interpret::value::{Int, Num, Str, Value},
    };

    fn hir_node<'heap>(interner: &HirInterner<'heap>, data: Data<'heap>) -> Node<'heap> {
        interner.intern_node(NodeData {
            id: HirId::PLACEHOLDER,
            span: SpanId::SYNTHETIC,
            kind: NodeKind::Data(data),
        })
    }

    #[test]
    fn reify_primitives_and_empty_tuple() {
        let heap = Heap::new();
        let hir_interner = HirInterner::new(&heap);
        let mir_interner = MirInterner::new(&heap);
        let scratch = Scratch::new();

        let alloc = &heap;
        let reify = |data| {
            reify_node(
                hir_node(&hir_interner, data),
                &mir_interner.symbols,
                &alloc,
                &scratch,
            )
        };

        assert_eq!(reify(Data::Primitive(Primitive::Null)), Value::Unit);
        assert_eq!(
            reify(Data::Primitive(Primitive::Boolean(true))),
            Value::Integer(Int::from(true))
        );
        assert_eq!(
            reify(Data::Primitive(Primitive::Integer(
                value::Integer::new_unchecked(heap.intern_symbol("42"))
            ))),
            Value::Integer(Int::from(42_i128))
        );

        let huge = "99999999999999999999999999999999999999999";
        let Value::Number(widened) = reify(Data::Primitive(Primitive::Integer(
            value::Integer::new_unchecked(heap.intern_symbol(huge)),
        ))) else {
            panic!("overflowing integer must widen to Number");
        };
        assert!(widened.is_finite());

        assert_eq!(
            reify(Data::Primitive(Primitive::Float(
                value::Float::new_unchecked(heap.intern_symbol("3.5"))
            ))),
            Value::Number(Num::from(3.5))
        );
        assert_eq!(
            reify(Data::Primitive(Primitive::String(value::String::new(
                heap.intern_symbol("hello"),
            )))),
            Value::String(Str::from(value::String::new(heap.intern_symbol("hello"))))
        );

        let empty_tuple = Data::Tuple(Tuple {
            fields: hir_interner.intern_nodes(&[]),
        });
        assert_eq!(reify(empty_tuple), Value::Unit);
    }

    fn hir_int<'heap>(heap: &'heap Heap, interner: &HirInterner<'heap>, raw: &str) -> Node<'heap> {
        hir_node(
            interner,
            Data::Primitive(Primitive::Integer(value::Integer::new_unchecked(
                heap.intern_symbol(raw),
            ))),
        )
    }

    #[test]
    fn reify_struct_with_list_and_tuple() {
        let heap = Heap::new();
        let hir_interner = HirInterner::new(&heap);
        let mir_interner = MirInterner::new(&heap);
        let scratch = Scratch::new();

        let list_node = hir_node(
            &hir_interner,
            Data::List(List {
                elements: hir_interner.intern_nodes(&[
                    hir_int(&heap, &hir_interner, "10"),
                    hir_int(&heap, &hir_interner, "20"),
                ]),
            }),
        );

        let tuple_node = hir_node(
            &hir_interner,
            Data::Tuple(Tuple {
                fields: hir_interner.intern_nodes(&[
                    hir_node(&hir_interner, Data::Primitive(Primitive::Boolean(false))),
                    hir_node(&hir_interner, Data::Primitive(Primitive::Null)),
                ]),
            }),
        );

        let ident = |name| Ident {
            span: SpanId::SYNTHETIC,
            value: heap.intern_symbol(name),
            kind: IdentKind::Lexical,
        };
        let mut fields = [
            StructField {
                name: ident("z_tuple"),
                value: tuple_node,
            },
            StructField {
                name: ident("a_list"),
                value: list_node,
            },
        ];
        let root = hir_node(
            &hir_interner,
            Data::Struct(Struct {
                fields: hir_interner.intern_struct_fields(&mut fields),
            }),
        );

        let alloc = &heap;
        let Value::Struct(r#struct) = reify_node(root, &mir_interner.symbols, &alloc, &scratch)
        else {
            panic!("expected struct value");
        };
        assert_eq!(r#struct.len(), 2);

        let Value::List(list) = r#struct
            .get_by_name(heap.intern_symbol("a_list"))
            .expect("a_list field")
        else {
            panic!("expected list in a_list");
        };
        assert_eq!(list.len(), 2);
        assert_eq!(
            list.get(Int::from(0_i32)),
            Some(&Value::Integer(Int::from(10_i128)))
        );
        assert_eq!(
            list.get(Int::from(1_i32)),
            Some(&Value::Integer(Int::from(20_i128)))
        );

        let Value::Tuple(tuple) = r#struct
            .get_by_name(heap.intern_symbol("z_tuple"))
            .expect("z_tuple field")
        else {
            panic!("expected tuple in z_tuple");
        };
        assert_eq!(
            tuple.values(),
            &[Value::Integer(Int::from(false)), Value::Unit]
        );
    }

    #[test]
    fn reify_dict_duplicate_key() {
        let heap = Heap::new();
        let hir_interner = HirInterner::new(&heap);
        let mir_interner = MirInterner::new(&heap);
        let scratch = Scratch::new();

        let key_node = hir_node(
            &hir_interner,
            Data::Primitive(Primitive::String(value::String::new(
                heap.intern_symbol("k"),
            ))),
        );
        let dict_node = hir_node(
            &hir_interner,
            Data::Dict(Dict {
                fields: hir_interner.intern_dict_fields(&[
                    DictField {
                        key: key_node,
                        value: hir_int(&heap, &hir_interner, "1"),
                    },
                    DictField {
                        key: key_node,
                        value: hir_int(&heap, &hir_interner, "2"),
                    },
                ]),
            }),
        );

        let alloc = &heap;
        let Value::Dict(dict) = reify_node(dict_node, &mir_interner.symbols, &alloc, &scratch)
        else {
            panic!("expected dict value");
        };
        assert_eq!(dict.len(), 1);
        let key = Value::String(Str::from(value::String::new(heap.intern_symbol("k"))));
        assert_eq!(dict.get(&key), Some(&Value::Integer(Int::from(2_i128))));
    }

    #[test]
    fn reify_empty_struct_in_global() {
        let heap = Heap::new();
        let hir_interner = HirInterner::new(&heap);
        let mir_interner = MirInterner::new(&heap);

        let root = hir_node(
            &hir_interner,
            Data::Struct(Struct {
                fields: hir_interner.intern_struct_fields(&mut []),
            }),
        );

        let Value::Struct(r#struct) = reify_node(root, &mir_interner.symbols, &Global, &Global)
        else {
            panic!("expected empty struct value");
        };
        assert!(r#struct.is_empty());
    }
}
