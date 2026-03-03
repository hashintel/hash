use hashql_core::{id::Id as _, r#type::kind::TypeKind};
use hashql_hir::node::{
    Node,
    access::{Access, FieldAccess, IndexAccess},
    data::Data,
    kind::NodeKind,
    variable::Variable,
};

use super::{
    Reifier,
    error::{expected_local_variable, external_modules_unsupported, type_cannot_be_indexed},
};
use crate::{
    body::{
        constant::Constant,
        local::Local,
        operand::Operand,
        place::{FieldIndex, Place, Projection, ProjectionKind},
    },
    interpret::value::{Int, TryFromPrimitiveError},
    reify::{
        error::{field_index_too_large, local_variable_unmapped},
        types::unwrap_union_type,
    },
};

impl<'heap> Reifier<'_, '_, '_, '_, 'heap> {
    fn local(&mut self, node: Node<'heap>) -> Local {
        let NodeKind::Variable(Variable::Local(local)) = node.kind else {
            self.state
                .diagnostics
                .push(expected_local_variable(node.span));

            // Return a bogus value, so that lowering can continue
            return Local::MAX;
        };

        let Some(local) = self.locals[local.id.value] else {
            self.state
                .diagnostics
                .push(local_variable_unmapped(node.span));

            // Return a bogus value, so that lowering can continue
            return Local::MAX;
        };

        local
    }

    fn place(&mut self, node: Node<'heap>) -> Place<'heap> {
        let mut projections = Vec::new();

        let mut current = node;
        loop {
            let result_type_id = self.context.hir.map.type_id(current.id);

            match current.kind {
                NodeKind::Access(Access::Field(FieldAccess { expr, field })) => {
                    let type_id = self.context.hir.map.type_id(expr.id);

                    let mut items = unwrap_union_type(type_id, self.context.mir.env).into_iter();
                    let first = items.next().unwrap_or_else(|| {
                        unreachable!(
                            "simplified unions are guaranteed to have at least one variant"
                        );
                    });

                    // Check what type the first element is, if it is a tuple we know that all types
                    // will be tuples, as indices do not constitute valid identifiers and can
                    // therefore not be used as field names in structs.
                    match first.kind {
                        TypeKind::Tuple(_) => {
                            let index = if let Ok(index) = field.value.as_str().parse() {
                                index
                            } else {
                                self.state
                                    .diagnostics
                                    .push(field_index_too_large(field.span, field.value));

                                0
                            };

                            projections.push(Projection {
                                r#type: result_type_id,
                                kind: ProjectionKind::Field(FieldIndex::new(index)),
                            });
                        }
                        TypeKind::Struct(_) => {
                            // TODO: in the future we must check if this is the only (closed) struct
                            // type, if that is the case, we can use `Projection::Field` instead,
                            // otherwise we must fall back to using the slower `FieldByName`.
                            // see: https://linear.app/hash/issue/BE-42/hashql-differentiate-between-open-and-closed-structs

                            projections.push(Projection {
                                r#type: result_type_id,
                                kind: ProjectionKind::FieldByName(field.value),
                            });
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
                        | TypeKind::Unknown => {
                            self.state
                                .diagnostics
                                .push(type_cannot_be_indexed(first.span));
                        }
                    }

                    current = expr;
                }
                NodeKind::Access(Access::Index(IndexAccess { expr, index })) => {
                    projections.push(Projection {
                        r#type: result_type_id,
                        kind: ProjectionKind::Index(self.local(index)),
                    });
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
            projections: self
                .context
                .mir
                .interner
                .projections
                .intern_slice(&projections),
        }
    }

    pub(super) fn operand(&mut self, node: Node<'heap>) -> Operand<'heap> {
        match node.kind {
            NodeKind::Variable(Variable::Qualified(_)) => {
                self.state
                    .diagnostics
                    .push(external_modules_unsupported(node.span).generalize());

                // Return a bogus value so that lowering can continue
                // In the future this would be a simple FnPtr
                Operand::Constant(Constant::Unit)
            }
            NodeKind::Data(Data::Primitive(primitive)) => {
                // First try if we can promote the primitive to a non-opaque constant:
                let constant = match Int::try_from(primitive) {
                    Ok(int) => Constant::Int(int),
                    Err(TryFromPrimitiveError { value, .. }) => Constant::Primitive(value),
                };

                Operand::Constant(constant)
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
