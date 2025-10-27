use hashql_core::r#type::kind::TypeKind;
use hashql_hir::node::{
    Node,
    access::{Access, FieldAccess, IndexAccess},
    data::Data,
    kind::NodeKind,
    variable::Variable,
};

use super::Reifier;
use crate::{
    body::{
        constant::Constant,
        local::Local,
        operand::Operand,
        place::{FieldIndex, Place, Projection},
    },
    reify::types::unwrap_union_type,
};

impl<'heap> Reifier<'_, '_, '_, '_, 'heap> {
    fn local(&self, node: Node<'heap>) -> Local {
        let NodeKind::Variable(Variable::Local(local)) = node.kind else {
            panic!("ICE: only local variables are allowed to be local")
        };

        let Some(local) = self.locals[local.id.value] else {
            panic!(
                "ICE: The variable should have been assigned to a local before reaching this \
                 point."
            )
        };

        local
    }

    fn place(&self, node: Node<'heap>) -> Place<'heap> {
        let mut projections = Vec::new();

        let mut current = node;
        loop {
            match current.kind {
                NodeKind::Access(Access::Field(FieldAccess { expr, field })) => {
                    let type_id = self.context.hir.map.type_id(current.id);

                    let mut items =
                        unwrap_union_type(type_id, self.context.environment).into_iter();
                    let first = items.next().unwrap_or_else(|| {
                        panic!("ICE: union types are guaranteed to be non-empty")
                    });

                    // Check what type the first element is, if it is a tuple we know that all types
                    // will be tuples, as indices do not constitute valid identifiers and can
                    // therefore not be used as field names in structs.
                    match first.kind {
                        TypeKind::Tuple(_) => {
                            let Ok(index) = field.value.as_str().parse() else {
                                panic!("ERR: value too big to be used as index")
                            };

                            projections.push(Projection::Field(FieldIndex::new(index)));
                        }
                        TypeKind::Struct(_) => {
                            // TODO: in the future we must check if this is the only (closed) struct
                            // type, if that is the case, we can use `Projection::Field` instead,
                            // otherwise we must fall back to using the slower `FieldByName`.

                            projections.push(Projection::FieldByName(field.value));
                        }
                        TypeKind::Opaque(_)
                        | TypeKind::Primitive(_)
                        | TypeKind::Intrinsic(_)
                        | TypeKind::Union(_)
                        | TypeKind::Intersection(_)
                        | TypeKind::Closure(_)
                        | TypeKind::Apply(_)
                        | TypeKind::Generic(_)
                        | TypeKind::Param(_)
                        | TypeKind::Infer(_)
                        | TypeKind::Never
                        | TypeKind::Unknown => unreachable!("other types cannot be indexed"),
                    }

                    current = expr;
                }
                NodeKind::Access(Access::Index(IndexAccess { expr, index })) => {
                    projections.push(Projection::Index(self.local(index)));
                    current = expr;
                }
                NodeKind::Data(_)
                | NodeKind::Variable(_)
                | NodeKind::Let(_)
                | NodeKind::Operation(_)
                | NodeKind::Call(_)
                | NodeKind::Branch(_)
                | NodeKind::Closure(_)
                | NodeKind::Thunk(_)
                | NodeKind::Graph(_) => break,
            }
        }

        // At this point the variable *must* be a local, due to HIR(ANF) rules
        let local = self.local(current);
        // projections are built outside -> inside, we need to reverse them
        projections.reverse();

        Place {
            local,
            projections: self.context.interner.projections.intern_slice(&projections),
        }
    }

    pub(super) fn operand(&self, node: Node<'heap>) -> Operand<'heap> {
        match node.kind {
            NodeKind::Variable(Variable::Qualified(_)) => {
                panic!("ERR: not supported (yet)") // <- would be an FnPtr
            }
            NodeKind::Data(Data::Primitive(primitive)) => {
                Operand::Constant(Constant::Primitive(primitive))
            }
            NodeKind::Variable(Variable::Local(local))
                if let Some(&ptr) = self
                    .state
                    .thunks
                    .defs
                    .get(local.id.value)
                    .and_then(Option::as_ref) =>
            {
                Operand::Constant(Constant::FnPtr(ptr))
            }
            NodeKind::Data(_)
            | NodeKind::Variable(_)
            | NodeKind::Let(_)
            | NodeKind::Operation(_)
            | NodeKind::Access(_)
            | NodeKind::Call(_)
            | NodeKind::Branch(_)
            | NodeKind::Closure(_)
            | NodeKind::Thunk(_)
            | NodeKind::Graph(_) => Operand::Place(self.place(node)),
        }
    }
}
