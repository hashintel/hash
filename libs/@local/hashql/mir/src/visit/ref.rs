use core::ops::Try;

use hashql_core::{
    intern::Interned, span::SpanId, symbol::Symbol, r#type::TypeId, value::Primitive,
};

use crate::{
    body::{
        Body, Source,
        basic_block::{BasicBlock, BasicBlockId},
        constant::{Constant, Int},
        local::{Local, LocalDecl},
        location::Location,
        operand::Operand,
        place::{
            Place, PlaceContext, PlaceLivenessContext, PlaceReadContext, PlaceRef,
            PlaceWriteContext, Projection, ProjectionKind,
        },
        rvalue::{Aggregate, AggregateKind, Apply, Binary, Input, RValue, Unary},
        statement::{Assign, Statement, StatementKind},
        terminator::{
            Goto, GraphRead, GraphReadBody, GraphReadHead, GraphReadLocation, GraphReadTail,
            Return, SwitchInt, Target, Terminator, TerminatorKind,
        },
    },
    def::DefId,
};

macro_rules! Ok {
    () => {
        Try::from_output(())
    };
}

/// Trait for read-only traversal of MIR structures.
///
/// The [`Visitor`] trait provides methods to traverse and analyze MIR structures without
/// modification. This is the recommended approach for analysis passes, linting, and any
/// operation that only needs to read MIR data.
///
/// Each method's default implementation recursively visits the substructure via the
/// corresponding `walk_*` function. For example, `visit_body` by default calls `walk_body`.
///
/// # Use Cases
///
/// Use the [`Visitor`] trait when you need to:
/// - Analyze the MIR without modifying it.
/// - Collect information about the program (e.g., find all uses of a local).
/// - Perform dataflow analysis (liveness, reaching definitions, etc.).
/// - Validate MIR invariants.
/// - Implement linting or optimization detection passes.
///
/// For transformations that modify the MIR, use [`VisitorMut`] instead.
///
/// # Implementation Strategy
///
/// To implement a visitor:
///
/// 1. Create a type that implements this trait
/// 2. Define the [`Result`](Self::Result) type (typically [`ControlFlow<()>`], [`Result<(), E>`] or
///    [`Result<(), !>`] in case no errors can occur).
/// 3. Override methods for the node types you want to process
/// 4. When overriding a method, you can:
///    - Process the node before visiting children
///    - Call the corresponding `walk_*` function to traverse children
///    - Process the node after visiting children
///    - Skip child traversal entirely by not calling `walk_*`
///
/// # Location Tracking
///
/// Every `visit_*` method receives a [`Location`] parameter that identifies the precise
/// program point being visited.
///
/// [`Location`]: crate::body::location::Location
/// [`VisitorMut`]: super::VisitorMut
/// [`ControlFlow<()>`]: core::ops::ControlFlow
pub trait Visitor<'heap> {
    /// The result type for visitor methods.
    ///
    /// This type must implement [`Try`] with an output of `()`, allowing for early
    /// termination on failure. Common choices include:
    /// - [`Result<(), E>`] for fallible operations
    /// - [`ControlFlow<B, ()>`] for control-flow based termination
    /// - [`Result<(), !>`] for infallible operations
    ///
    /// [`ControlFlow<B, ()>`]: core::ops::ControlFlow
    type Result: Try<Output = ()>;

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_span(&mut self, span: SpanId) -> Self::Result {
        // leaf: nothing to do
        Ok!()
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_type_id(&mut self, type_id: TypeId) -> Self::Result {
        // leaf: nothing to do
        Ok!()
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_symbol(&mut self, location: Location, symbol: Symbol<'heap>) -> Self::Result {
        // leaf: nothing to do
        Ok!()
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_source(&mut self, source: &Source<'heap>) -> Self::Result {
        // leaf: nothing to do
        // in theory this references symbols and DefId through the source attribute, but we don't
        // follow these by default on purpose. As this is just debug information it actually doesn't
        // contribute to the overall graph structure.
        Ok!()
    }

    fn visit_body(&mut self, body: &Body<'heap>) -> Self::Result {
        walk_body(self, body)
    }

    fn visit_local_decl(&mut self, local: Local, decl: &LocalDecl<'heap>) -> Self::Result {
        walk_local_decl(self, local, decl)
    }

    fn visit_basic_block(&mut self, id: BasicBlockId, block: &BasicBlock<'heap>) -> Self::Result {
        walk_basic_block(self, id, block)
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_def_id(&mut self, location: Location, def_id: DefId) -> Self::Result {
        // leaf: nothing to do
        Ok!()
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_local(
        &mut self,
        location: Location,
        context: PlaceContext,
        local: Local,
    ) -> Self::Result {
        // leaf, nothing to do
        Ok!()
    }

    fn visit_projection(
        &mut self,
        location: Location,
        context: PlaceContext,
        base: PlaceRef<'_, 'heap>,
        projection: Projection<'heap>,
    ) -> Self::Result {
        walk_projection(self, location, context, base, projection)
    }

    fn visit_place(
        &mut self,
        location: Location,
        context: PlaceContext,
        place: &Place<'heap>,
    ) -> Self::Result {
        walk_place(self, location, context, place)
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_int(&mut self, location: Location, int: &Int) -> Self::Result {
        // leaf, nothing to do
        Ok!()
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_primitive(
        &mut self,
        location: Location,
        primitive: &Primitive<'heap>,
    ) -> Self::Result {
        // leaf, nothing to do
        Ok!()
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_unit(&mut self, location: Location) -> Self::Result {
        // leaf, nothing to do
        Ok!()
    }

    fn visit_constant(&mut self, location: Location, constant: &Constant<'heap>) -> Self::Result {
        walk_constant(self, location, constant)
    }

    fn visit_operand(&mut self, location: Location, operand: &Operand<'heap>) -> Self::Result {
        walk_operand(self, location, operand)
    }

    // The mut version would be `basic_block_id: &mut BasicBlockId`
    #[expect(unused_variables, reason = "trait definition")]
    fn visit_basic_block_id(
        &mut self,
        location: Location,
        basic_block_id: BasicBlockId,
    ) -> Self::Result {
        // leaf, nothing to do
        Ok!()
    }

    // The mut version would be `params: &mut Interned<'heap, [Local]>`
    fn visit_basic_block_params(
        &mut self,
        location: Location,
        params: Interned<'heap, [Local]>,
    ) -> Self::Result {
        walk_params(self, location, params)
    }

    fn visit_target(&mut self, location: Location, target: &Target<'heap>) -> Self::Result {
        walk_target(self, location, target)
    }

    fn visit_statement(
        &mut self,
        location: Location,
        statement: &Statement<'heap>,
    ) -> Self::Result {
        walk_statement(self, location, statement)
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_statement_nop(&mut self, location: Location) -> Self::Result {
        // leaf: nothing to do
        Ok!()
    }

    fn visit_statement_assign(
        &mut self,
        location: Location,
        assign: &Assign<'heap>,
    ) -> Self::Result {
        walk_statement_assign(self, location, assign)
    }

    // This would be `&mut Local` in `VisitorMut`
    fn visit_statement_storage_live(&mut self, location: Location, local: Local) -> Self::Result {
        walk_statement_storage_live(self, location, local)
    }

    // This would be `&mut Local` in `VisitorMut`
    fn visit_statement_storage_dead(&mut self, location: Location, local: Local) -> Self::Result {
        walk_statement_storage_dead(self, location, local)
    }

    fn visit_rvalue(&mut self, location: Location, rvalue: &RValue<'heap>) -> Self::Result {
        walk_rvalue(self, location, rvalue)
    }

    fn visit_rvalue_binary(&mut self, location: Location, binary: &Binary<'heap>) -> Self::Result {
        walk_rvalue_binary(self, location, binary)
    }

    fn visit_rvalue_unary(&mut self, location: Location, unary: &Unary<'heap>) -> Self::Result {
        walk_rvalue_unary(self, location, unary)
    }

    fn visit_rvalue_aggregate(
        &mut self,
        location: Location,
        aggregate: &Aggregate<'heap>,
    ) -> Self::Result {
        walk_rvalue_aggregate(self, location, aggregate)
    }

    fn visit_rvalue_input(&mut self, location: Location, input: &Input<'heap>) -> Self::Result {
        walk_rvalue_input(self, location, input)
    }

    fn visit_rvalue_apply(&mut self, location: Location, apply: &Apply<'heap>) -> Self::Result {
        walk_rvalue_apply(self, location, apply)
    }

    fn visit_terminator(
        &mut self,
        location: Location,
        terminator: &Terminator<'heap>,
    ) -> Self::Result {
        walk_terminator(self, location, terminator)
    }

    fn visit_terminator_goto(&mut self, location: Location, goto: &Goto<'heap>) -> Self::Result {
        walk_terminator_goto(self, location, goto)
    }

    fn visit_terminator_switch_int(
        &mut self,
        location: Location,
        branch: &SwitchInt<'heap>,
    ) -> Self::Result {
        walk_terminator_switch_int(self, location, branch)
    }

    fn visit_terminator_return(
        &mut self,
        location: Location,
        r#return: &Return<'heap>,
    ) -> Self::Result {
        walk_terminator_return(self, location, r#return)
    }

    fn visit_terminator_graph_read(
        &mut self,
        location: Location,
        graph_read: &GraphRead<'heap>,
    ) -> Self::Result {
        walk_terminator_graph_read(self, location, graph_read)
    }

    fn visit_graph_read_head(
        &mut self,
        location: GraphReadLocation,
        head: &GraphReadHead<'heap>,
    ) -> Self::Result {
        walk_graph_read_head(self, location, head)
    }

    fn visit_graph_read_body(
        &mut self,
        location: GraphReadLocation,
        body: &GraphReadBody,
    ) -> Self::Result {
        walk_graph_read_body(self, location, body)
    }

    // The mut version would be `tail: &mut GraphReadTail`
    fn visit_graph_read_tail(
        &mut self,
        location: GraphReadLocation,
        tail: GraphReadTail,
    ) -> Self::Result {
        walk_graph_read_tail(self, location, tail)
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_terminator_unreachable(&mut self, location: Location) -> Self::Result {
        // leaf: nothing to do
        Ok!()
    }
}

pub fn walk_params<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    params: Interned<'heap, [Local]>,
) -> T::Result {
    for param in params {
        visitor.visit_local(
            location,
            PlaceContext::Write(PlaceWriteContext::BlockParam),
            *param,
        )?;
    }

    Ok!()
}

pub fn walk_body<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Body {
        id: _,
        span,
        return_type: r#type,
        source,
        local_decls,
        basic_blocks,
        args: _,
    }: &Body<'heap>,
) -> T::Result {
    // We do not visit the `DefId` here, as it doesn't make sense.
    visitor.visit_span(*span)?;
    visitor.visit_type_id(*r#type)?;
    visitor.visit_source(source)?;

    for (id, local_decl) in local_decls.iter_enumerated() {
        visitor.visit_local_decl(id, local_decl)?;
    }

    for (id, basic_block) in basic_blocks.iter_enumerated() {
        visitor.visit_basic_block(id, basic_block)?;
    }

    Ok!()
}

pub fn walk_local_decl<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    _local: Local,
    LocalDecl {
        span,
        r#type,
        name: _,
    }: &LocalDecl<'heap>,
) -> T::Result {
    visitor.visit_span(*span)?;
    visitor.visit_type_id(*r#type)?;

    // We don't visit the name here because it's outside of a body and doesn't have a location
    // associated with it.

    Ok!()
}

pub fn walk_basic_block<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    id: BasicBlockId,
    BasicBlock {
        params,
        statements,
        terminator,
    }: &BasicBlock<'heap>,
) -> T::Result {
    let mut location = Location {
        block: id,
        statement_index: 0,
    };

    visitor.visit_basic_block_id(location, id)?;
    visitor.visit_basic_block_params(location, *params)?;

    location.statement_index += 1;

    for statement in statements {
        visitor.visit_statement(location, statement)?;
        location.statement_index += 1;
    }

    visitor.visit_terminator(location, terminator)?;

    Ok!()
}

pub fn walk_projection<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    _context: PlaceContext,
    _base: PlaceRef<'_, 'heap>,
    Projection { r#type, kind }: Projection<'heap>,
) -> T::Result {
    visitor.visit_type_id(r#type)?;

    match kind {
        ProjectionKind::Field(_) => Ok!(),
        ProjectionKind::FieldByName(name) => visitor.visit_symbol(location, name),
        ProjectionKind::Index(local) => {
            visitor.visit_local(location, PlaceContext::Read(PlaceReadContext::Load), local)
        }
    }
}

pub fn walk_place<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    mut context: PlaceContext,
    place @ Place { local, projections }: &Place<'heap>,
) -> T::Result {
    // If the context is a use (aka read or write) change to a projection (if it really is a
    // projection)
    if context.is_use() && !projections.is_empty() {
        context = if context.is_write() {
            PlaceContext::Write(PlaceWriteContext::Projection)
        } else {
            PlaceContext::Read(PlaceReadContext::Projection)
        };
    }

    visitor.visit_local(location, context, *local)?;

    for (base, projection) in place.iter_projections() {
        visitor.visit_projection(location, context, base, projection)?;
    }

    Ok!()
}

pub fn walk_constant<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    constant: &Constant<'heap>,
) -> T::Result {
    match constant {
        Constant::Int(int) => visitor.visit_int(location, int),
        Constant::Primitive(primitive) => visitor.visit_primitive(location, primitive),
        Constant::Unit => visitor.visit_unit(location),
        Constant::FnPtr(def_id) => visitor.visit_def_id(location, *def_id),
    }
}

pub fn walk_operand<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    operand: &Operand<'heap>,
) -> T::Result {
    match operand {
        Operand::Place(place) => {
            visitor.visit_place(location, PlaceContext::Read(PlaceReadContext::Load), place)
        }
        Operand::Constant(constant) => visitor.visit_constant(location, constant),
    }
}

pub fn walk_target<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Target { block, args }: &Target<'heap>,
) -> T::Result {
    visitor.visit_basic_block_id(location, *block);
    for operand in args {
        visitor.visit_operand(location, operand)?;
    }

    Ok!()
}

pub fn walk_statement<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Statement { span, kind }: &Statement<'heap>,
) -> T::Result {
    visitor.visit_span(*span)?;

    match kind {
        StatementKind::Assign(assign) => visitor.visit_statement_assign(location, assign),
        StatementKind::Nop => visitor.visit_statement_nop(location),
        StatementKind::StorageLive(local) => visitor.visit_statement_storage_live(location, *local),
        StatementKind::StorageDead(local) => visitor.visit_statement_storage_dead(location, *local),
    }
}

pub fn walk_statement_assign<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Assign { lhs, rhs }: &Assign<'heap>,
) -> T::Result {
    visitor.visit_place(
        location,
        PlaceContext::Write(PlaceWriteContext::Assign),
        lhs,
    )?;
    visitor.visit_rvalue(location, rhs)?;

    Ok!()
}

pub fn walk_statement_storage_live<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    local: Local,
) -> T::Result {
    visitor.visit_local(
        location,
        PlaceContext::Liveness(PlaceLivenessContext::Begin),
        local,
    )?;

    Ok!()
}

pub fn walk_statement_storage_dead<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    local: Local,
) -> T::Result {
    visitor.visit_local(
        location,
        PlaceContext::Liveness(PlaceLivenessContext::End),
        local,
    )?;

    Ok!()
}

pub fn walk_rvalue<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    rvalue: &RValue<'heap>,
) -> T::Result {
    match rvalue {
        RValue::Load(operand) => visitor.visit_operand(location, operand),
        RValue::Binary(binary) => visitor.visit_rvalue_binary(location, binary),
        RValue::Unary(unary) => visitor.visit_rvalue_unary(location, unary),
        RValue::Aggregate(aggregate) => visitor.visit_rvalue_aggregate(location, aggregate),
        RValue::Input(input) => visitor.visit_rvalue_input(location, input),
        RValue::Apply(apply) => visitor.visit_rvalue_apply(location, apply),
    }
}

pub fn walk_rvalue_binary<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Binary { op: _, left, right }: &Binary<'heap>,
) -> T::Result {
    visitor.visit_operand(location, left)?;
    visitor.visit_operand(location, right)?;

    Ok!()
}

pub fn walk_rvalue_unary<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Unary { op: _, operand }: &Unary<'heap>,
) -> T::Result {
    visitor.visit_operand(location, operand)?;

    Ok!()
}

pub fn walk_rvalue_aggregate<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Aggregate { kind, operands }: &Aggregate<'heap>,
) -> T::Result {
    match kind {
        AggregateKind::Struct { fields } => {
            for field in fields {
                visitor.visit_symbol(location, *field)?;
            }
        }
        AggregateKind::Opaque(name) => {
            visitor.visit_symbol(location, *name)?;
        }
        AggregateKind::Tuple
        | AggregateKind::List
        | AggregateKind::Dict
        | AggregateKind::Closure => {}
    }

    for operand in operands {
        visitor.visit_operand(location, operand)?;
    }

    Ok!()
}

pub fn walk_rvalue_input<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Input { op: _, name }: &Input<'heap>,
) -> T::Result {
    visitor.visit_symbol(location, *name)?;
    Ok!()
}

pub fn walk_rvalue_apply<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Apply {
        function,
        arguments,
    }: &Apply<'heap>,
) -> T::Result {
    visitor.visit_operand(location, function)?;

    for argument in arguments {
        visitor.visit_operand(location, argument)?;
    }

    Ok!()
}

pub fn walk_terminator<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Terminator { span, kind }: &Terminator<'heap>,
) -> T::Result {
    visitor.visit_span(*span)?;

    match kind {
        TerminatorKind::Goto(goto) => visitor.visit_terminator_goto(location, goto),
        TerminatorKind::SwitchInt(branch) => visitor.visit_terminator_switch_int(location, branch),
        TerminatorKind::Return(r#return) => visitor.visit_terminator_return(location, r#return),
        TerminatorKind::GraphRead(graph_read) => {
            visitor.visit_terminator_graph_read(location, graph_read)
        }
        TerminatorKind::Unreachable => visitor.visit_terminator_unreachable(location),
    }
}

pub fn walk_terminator_goto<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Goto { target }: &Goto<'heap>,
) -> T::Result {
    visitor.visit_target(location, target)?;
    Ok!()
}

pub fn walk_terminator_switch_int<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    SwitchInt {
        discriminant,
        targets,
    }: &SwitchInt<'heap>,
) -> T::Result {
    visitor.visit_operand(location, discriminant)?;

    for target in targets.targets() {
        visitor.visit_target(location, target)?;
    }

    Ok!()
}

pub fn walk_terminator_return<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Return { value }: &Return<'heap>,
) -> T::Result {
    visitor.visit_operand(location, value)?;
    Ok!()
}

pub fn walk_terminator_graph_read<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    GraphRead {
        head,
        body,
        tail,
        target,
    }: &GraphRead<'heap>,
) -> T::Result {
    let mut location = GraphReadLocation {
        base: location,
        graph_read_index: 0,
    };

    visitor.visit_graph_read_head(location, head)?;
    location.graph_read_index += 1;

    for body in body {
        visitor.visit_graph_read_body(location, body)?;
        location.graph_read_index += 1;
    }

    visitor.visit_graph_read_tail(location, *tail)?;
    visitor.visit_basic_block_id(location.base, *target)?;

    Ok!()
}

pub fn walk_graph_read_head<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: GraphReadLocation,
    head: &GraphReadHead<'heap>,
) -> T::Result {
    match head {
        GraphReadHead::Entity { axis } => visitor.visit_operand(location.base, axis),
    }
}

pub fn walk_graph_read_body<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    location: GraphReadLocation,
    body: &GraphReadBody,
) -> T::Result {
    match body {
        GraphReadBody::Filter(func, env) => {
            visitor.visit_def_id(location.base, *func)?;
            visitor.visit_local(
                location.base,
                PlaceContext::Read(PlaceReadContext::Load),
                *env,
            )
        }
    }
}

pub fn walk_graph_read_tail<'heap, T: Visitor<'heap> + ?Sized>(
    _visitor: &mut T,
    _location: GraphReadLocation,
    tail: GraphReadTail,
) -> T::Result {
    match tail {
        GraphReadTail::Collect => Ok!(),
    }
}
