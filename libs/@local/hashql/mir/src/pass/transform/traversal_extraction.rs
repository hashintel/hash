use core::{alloc::Allocator, convert::Infallible};

use hashql_core::{heap::Heap, id::Id as _, span::SpanId};

use crate::{
    body::{
        Body, Source,
        basic_block::{BasicBlock, BasicBlockId},
        local::{Local, LocalDecl, LocalVec},
        location::Location,
        operand::Operand,
        place::Place,
        rvalue::RValue,
        statement::{Assign, Statement, StatementKind},
    },
    context::MirContext,
    pass::{Changed, TransformPass},
    visit::{self, VisitorMut, r#mut::filter},
};

pub struct Traversals<'heap> {
    source: Local,
    derivations: LocalVec<Option<Place<'heap>>, &'heap Heap>,
}

impl<'heap> Traversals<'heap> {
    fn with_capacity_in(source: Local, capacity: usize, heap: &'heap Heap) -> Self {
        Self {
            source,
            derivations: LocalVec::with_capacity_in(capacity, heap),
        }
    }

    fn insert(&mut self, local: Local, place: Place<'heap>) {
        debug_assert_eq!(place.local, self.source);

        self.derivations.insert(local, place);
    }

    #[must_use]
    #[inline]
    pub fn lookup(&self, local: Local) -> Option<&Place<'heap>> {
        self.derivations.lookup(local)
    }
}

struct TraversalExtractionVisitor<'heap, A: Allocator> {
    target: Local,
    target_decl: LocalDecl<'heap>,

    current_span: SpanId,

    total_locals: Local,
    pending_locals: Vec<LocalDecl<'heap>, A>,
    pending_statements: Vec<Statement<'heap>, A>,

    traversals: Traversals<'heap>,
    changed: Changed,
}

impl<'heap, A: Allocator> VisitorMut<'heap> for TraversalExtractionVisitor<'heap, A> {
    type Filter = filter::Deep;
    type Residual = Result<Infallible, !>;
    type Result<T>
        = Result<T, !>
    where
        T: 'heap;

    fn visit_operand(&mut self, _: Location, operand: &mut Operand<'heap>) -> Self::Result<()> {
        let Some(place) = operand.as_place() else {
            return Ok(());
        };

        if place.local != self.target {
            return Ok(());
        }

        let r#type = place.type_id_unchecked(&self.target_decl);

        // provision a new local
        let new_local = self.total_locals.plus(self.pending_locals.len());

        self.pending_locals.push(LocalDecl {
            span: self.target_decl.span,
            r#type,
            name: None,
        });
        self.pending_statements.push(Statement {
            span: self.current_span,
            kind: StatementKind::Assign(Assign {
                lhs: Place::local(new_local),
                rhs: RValue::Load(Operand::Place(*place)),
            }),
        });

        // Replace the operand with the new local
        *operand = Operand::Place(Place::local(new_local));

        Ok(())
    }

    fn visit_rvalue(&mut self, location: Location, rvalue: &mut RValue<'heap>) -> Self::Result<()> {
        // loads are handled by the statement_assign visitor and therefore not needed here
        match rvalue {
            RValue::Load(_) => return Ok(()),
            RValue::Binary(_)
            | RValue::Unary(_)
            | RValue::Aggregate(_)
            | RValue::Input(_)
            | RValue::Apply(_) => {}
        }

        visit::r#mut::walk_rvalue(self, location, rvalue)
    }

    fn visit_statement_assign(
        &mut self,
        location: Location,
        assign: &mut Assign<'heap>,
    ) -> Self::Result<()> {
        Ok(()) = visit::r#mut::walk_statement_assign(self, location, assign);

        let Assign { lhs, rhs } = assign;

        if !lhs.projections.is_empty() {
            return Ok(());
        }

        let RValue::Load(Operand::Place(rhs)) = rhs else {
            return Ok(());
        };

        if rhs.local != self.target {
            return Ok(());
        }

        // lhs is a traversal onto rhs (our target)
        self.traversals.insert(lhs.local, *rhs);

        Ok(())
    }

    fn visit_statement(
        &mut self,
        location: Location,
        statement: &mut Statement<'heap>,
    ) -> Self::Result<()> {
        self.current_span = statement.span;

        visit::r#mut::walk_statement(self, location, statement)
    }

    fn visit_basic_block(
        &mut self,
        id: BasicBlockId,
        BasicBlock {
            params,
            statements,
            terminator,
        }: &mut BasicBlock<'heap>,
    ) -> Self::Result<()> {
        let mut location = Location {
            block: id,
            statement_index: 0,
        };

        // We do not visit the basic block id here because it **cannot** be changed
        self.visit_basic_block_params(location, params)?;

        location.statement_index += 1;

        while location.statement_index <= statements.len() {
            // statement_index is 1 indexed, therefore the `<=`
            let index = location.statement_index - 1;

            let statement = &mut statements[index];
            Ok(()) = self.visit_statement(location, statement);

            if self.pending_statements.is_empty() {
                location.statement_index += 1;
                continue;
            }

            // We do not increment the counter on purpose, to allow us to traverse the new
            // statements again. The second iteration will *not* add any new statements, and is
            // therefore safe.
            statements.splice(index..index, self.pending_statements.drain(..));
            self.changed = Changed::Yes;
        }

        self.visit_terminator(location, terminator)?;

        Ok(())
    }
}

pub struct TraversalExtraction<'heap, A: Allocator> {
    alloc: A,
    traversals: Option<Traversals<'heap>>,
}

impl<'heap, A: Allocator> TraversalExtraction<'heap, A> {
    pub const fn new_in(alloc: A) -> Self {
        Self {
            alloc,
            traversals: None,
        }
    }

    pub const fn take_traversals(&mut self) -> Option<Traversals<'heap>> {
        self.traversals.take()
    }
}

impl<'env, 'heap, A: Allocator> TransformPass<'env, 'heap> for TraversalExtraction<'heap, A> {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) -> Changed {
        if !matches!(body.source, Source::GraphReadFilter(_)) {
            self.traversals = None;
            return Changed::No;
        }

        debug_assert_eq!(body.args, 2);
        // The second argument is the vertex, which we try to traverse;
        let vertex = Local::new(1);

        let mut visitor = TraversalExtractionVisitor {
            target: vertex,
            target_decl: body.local_decls[vertex],
            current_span: SpanId::SYNTHETIC,
            total_locals: body.local_decls.bound(),
            pending_locals: Vec::new_in(&self.alloc),
            pending_statements: Vec::new_in(&self.alloc),
            traversals: Traversals::with_capacity_in(vertex, body.local_decls.len(), context.heap),
            changed: Changed::No,
        };
        Ok(()) = visitor.visit_body_preserving_cfg(body);

        body.local_decls.extend(visitor.pending_locals);

        self.traversals = Some(visitor.traversals);
        visitor.changed
    }
}
