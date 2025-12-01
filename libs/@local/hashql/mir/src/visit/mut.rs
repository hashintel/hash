use core::{
    hash::Hash,
    mem,
    ops::{ControlFlow, FromResidual as _, Try},
};

use hashql_core::{
    intern::{Beef, InternSet, Interned},
    span::SpanId,
    symbol::Symbol,
    r#type::TypeId,
    value::Primitive,
};

use self::filter::Filter as _;
use crate::{
    body::{
        Body, Source,
        basic_block::{BasicBlock, BasicBlockId},
        constant::Constant,
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
    intern::Interner,
};

macro_rules! Ok {
    () => {
        Try::from_output(())
    };
}

/// Filtering strategies for controlling traversal depth in mutable visitors.
///
/// This module provides filter types that control how deeply a [`VisitorMut`] traverses
/// and modifies the MIR structure. Filters determine which parts of the MIR are eligible
/// for modification during traversal.
///
/// Currently, filtering controls whether interned data structures are deeply traversed
/// and modified. Future extensions may add additional filtering capabilities for other
/// aspects of MIR traversal.
///
/// [`VisitorMut`]: super::VisitorMut
pub mod filter {
    /// Trait defining the filtering strategy for a visitor.
    ///
    /// Implementors of this trait specify which parts of the MIR structure should be
    /// deeply traversed and potentially modified during visitation.
    pub trait Filter {
        /// Controls whether interned data structures should be deeply traversed.
        ///
        /// When `true`, the visitor will copy interned slices (using copy-on-write via
        /// [`Beef`]), allow modifications to their contents, and re-intern them if changes
        /// occur. This enables full structural modifications but requires an interner.
        ///
        /// When `false`, the visitor will skip traversal of interned slices entirely.
        /// The elements within those slices will not be visited.
        ///
        /// # Future Extensions
        ///
        /// Additional filtering capabilities may be added to this trait as needed,
        /// allowing fine-grained control over what gets traversed during visitation.
        ///
        /// [`Beef`]: hashql_core::intern::Beef
        const FOLD_INTERNED: bool;
    }

    /// Deep filtering strategy: enables full structural modification.
    ///
    /// This filter allows the visitor to modify all parts of the MIR structure,
    /// including the contents of interned slices. When using this filter:
    ///
    /// - Interned slices are copied using copy-on-write ([`Beef`])
    /// - The visitor can modify the contents of these slices
    /// - Modified slices are re-interned if changes occurred
    /// - The visitor must provide access to an [`Interner`]
    ///
    /// Use this filter when your transformation needs to modify interned data,
    /// such as filtering statements from a basic block or reordering operands.
    ///
    /// # Performance
    ///
    /// Deep filtering is more expensive than shallow filtering due to copying and
    /// re-interning overhead. Only use it when necessary.
    ///
    /// [`Beef`]: hashql_core::intern::Beef
    /// [`Interner`]: crate::intern::Interner
    pub struct Deep(());

    impl Filter for Deep {
        const FOLD_INTERNED: bool = true;
    }

    /// Shallow filtering strategy: skips interned data structures.
    ///
    /// This filter causes the visitor to skip traversal of interned slices entirely.
    /// When using this filter:
    ///
    /// - Interned slices are not visited at all
    /// - Elements within those slices are not traversed or modified
    /// - Only non-interned parts of the MIR can be modified
    /// - No interner is required
    ///
    /// Use this filter when your transformation only needs to modify non-interned data,
    /// such as replacing individual local variable references, updating basic block IDs,
    /// or swapping constants in operands.
    ///
    /// # Performance
    ///
    /// Shallow filtering is more efficient than deep filtering since it avoids
    /// traversing, copying, and re-interning interned slices. Prefer this when possible.
    pub struct Shallow(());

    impl Filter for Shallow {
        const FOLD_INTERNED: bool = false;
    }
}

/// Trait for traversing and modifying MIR structures in-place.
///
/// The [`VisitorMut`] trait provides methods to traverse each type of node in the MIR control
/// flow graph while allowing in-place modifications. This is the recommended approach for
/// transformation passes, optimizations, and any operation that needs to modify the MIR.
///
/// Each method's default implementation recursively visits the substructure via the
/// corresponding `walk_*` function. For example, `visit_body` by default calls `walk_body`.
///
/// # Use Cases
///
/// Use the [`VisitorMut`] trait when you need to:
/// - Transform or optimize MIR structures
/// - Replace inefficient patterns with better equivalents
/// - Normalize MIR for later passes
/// - Inject instrumentation or additional tracking
/// - Perform constant propagation or other optimizations
///
/// For analysis that doesn't need modification, use [`Visitor`] instead - it's simpler,
/// safer, and more efficient.
///
/// # Implementation Strategy
///
/// To implement a mutable visitor:
///
/// 1. Create a type that implements this trait
/// 2. Define the [`Residual`](Self::Residual) and [`Result`](Self::Result) types
/// 3. Choose a [`Filter`](Self::Filter) type based on what you're modifying:
///    - [`filter::Shallow`]: When only modifying non-interned data (locals, IDs, etc.)
///    - [`filter::Deep`]: When modifying interned slices (requires implementing
///      [`interner`](Self::interner))
/// 4. Override methods for the node types you want to modify
/// 5. When overriding a method, you can:
///    - Modify the node before visiting children
///    - Call the corresponding `walk_*` function to traverse children
///    - Modify the node after visiting children
///    - Skip child traversal entirely by not calling `walk_*`
///
/// # Filter Types
///
/// The [`Filter`](Self::Filter) associated type controls how deeply interned data is processed:
///
/// - [`filter::Shallow`]: Visits interned slices but doesn't copy or re-intern them. Use this when
///   you're only modifying non-interned fields (locals, basic block IDs, etc.). This is more
///   efficient and doesn't require an interner.
///
/// - [`filter::Deep`]: Copies interned slices using copy-on-write ([`Beef`]), allows modification,
///   and re-interns them if changed. Use this when you need to modify the contents of interned
///   slices. Requires implementing [`interner`](Self::interner).
///
/// [`Beef`]: hashql_core::intern::Beef
/// [`Location`]: crate::body::location::Location
/// [`Visitor`]: super::Visitor
pub trait VisitorMut<'heap> {
    /// The residual type for error handling (e.g., [`Result<Infallible, E>`] for [`Result<T, E>`]).
    type Residual;

    /// The output type that wraps results (must implement [`Try`]).
    ///
    /// Common choices include:
    /// - [`Result<T, !>`] for infallible operations
    /// - [`Result<T, E>`] for fallible operations
    /// - [`ControlFlow<B, T>`] for control-flow based termination
    type Result<T>: Try<Output = T, Residual = Self::Residual>
    where
        T: 'heap;

    /// Controls how deeply to process interned data.
    ///
    /// - [`filter::Deep`]: Modifies interned slices (requires [`interner`](Self::interner))
    /// - [`filter::Shallow`]: Visits but doesn't modify interned slices
    type Filter: filter::Filter = filter::Deep;

    /// Provides access to the interner for deep filtering.
    ///
    /// **Required** if `Filter = filter::Deep`. If not implemented with `Deep` a panic will be
    /// issued once an interned slice is encountered.
    ///
    /// **Not needed** if `Filter = filter::Shallow`.
    fn interner(&self) -> &Interner<'heap> {
        panic!("must be implemented if filter has T::FOLD_INTERNED enabled")
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_span(&mut self, span: &mut SpanId) -> Self::Result<()> {
        // leaf: nothing to do
        Ok!()
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_type_id(&mut self, r#type: &mut TypeId) -> Self::Result<()> {
        // leaf: nothing to do
        Ok!()
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_symbol(&mut self, location: Location, symbol: &mut Symbol<'heap>) -> Self::Result<()> {
        // leaf: nothing to do
        Ok!()
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_source(&mut self, source: &mut Source<'heap>) -> Self::Result<()> {
        // leaf: nothing to do
        Ok!()
    }

    fn visit_body(&mut self, body: &mut Body<'heap>) -> Self::Result<()> {
        walk_body(self, body)
    }

    fn visit_body_preserving_cfg(&mut self, body: &mut Body<'heap>) -> Self::Result<()> {
        walk_body_preserving_cfg(self, body)
    }

    fn visit_local_decl(&mut self, local: Local, decl: &mut LocalDecl<'heap>) -> Self::Result<()> {
        walk_local_decl(self, local, decl)
    }

    fn visit_basic_block(
        &mut self,
        id: BasicBlockId,
        block: &mut BasicBlock<'heap>,
    ) -> Self::Result<()> {
        walk_basic_block(self, id, block)
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_def_id(&mut self, location: Location, def_id: &mut DefId) -> Self::Result<()> {
        // leaf: nothing to do
        Ok!()
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_local(
        &mut self,
        location: Location,
        context: PlaceContext,
        local: &mut Local,
    ) -> Self::Result<()> {
        // leaf: do nothing
        Ok!()
    }

    /// Folds a projection, potentially transforming it.
    ///
    /// Unlike most visitor methods which mutate nodes in place, this method takes a projection by
    /// value and returns a (potentially modified) projection. This is required to make the
    /// transformation *explicit*. [`Projection`] is only referenced in a place through an interned
    /// slice, unlike other nodes, which are also stored outside of interned slices.
    ///
    /// The `base` parameter provides the [`PlaceRef`] up to (but not including) this projection,
    /// giving context about what is being projected from.
    fn fold_projection(
        &mut self,
        location: Location,
        context: PlaceContext,
        base: PlaceRef<'_, 'heap>,
        projection: Projection<'heap>,
    ) -> Self::Result<Projection<'heap>> {
        walk_projection(self, location, context, base, projection)
    }

    fn visit_place(
        &mut self,
        location: Location,
        context: PlaceContext,
        place: &mut Place<'heap>,
    ) -> Self::Result<()> {
        walk_place(self, location, context, place)
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_primitive(
        &mut self,
        location: Location,
        primitive: &mut Primitive<'heap>,
    ) -> Self::Result<()> {
        // leaf, nothing to do
        Ok!()
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_unit(&mut self, location: Location) -> Self::Result<()> {
        // leaf, nothing to do
        Ok!()
    }

    fn visit_constant(
        &mut self,
        location: Location,
        constant: &mut Constant<'heap>,
    ) -> Self::Result<()> {
        walk_constant(self, location, constant)
    }

    fn visit_operand(
        &mut self,
        location: Location,
        operand: &mut Operand<'heap>,
    ) -> Self::Result<()> {
        walk_operand(self, location, operand)
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_basic_block_id(
        &mut self,
        location: Location,
        basic_block_id: &mut BasicBlockId,
    ) -> Self::Result<()> {
        // leaf, nothing to do
        Ok!()
    }

    fn visit_basic_block_params(
        &mut self,
        location: Location,
        params: &mut Interned<'heap, [Local]>,
    ) -> Self::Result<()> {
        walk_params(self, location, params)
    }

    fn visit_target(&mut self, location: Location, target: &mut Target<'heap>) -> Self::Result<()> {
        walk_target(self, location, target)
    }

    fn visit_statement(
        &mut self,
        location: Location,
        statement: &mut Statement<'heap>,
    ) -> Self::Result<()> {
        walk_statement(self, location, statement)
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_statement_nop(&mut self, location: Location) -> Self::Result<()> {
        // leaf: nothing to do
        Ok!()
    }

    fn visit_statement_assign(
        &mut self,
        location: Location,
        assign: &mut Assign<'heap>,
    ) -> Self::Result<()> {
        walk_statement_assign(self, location, assign)
    }

    fn visit_statement_storage_live(
        &mut self,
        location: Location,
        local: &mut Local,
    ) -> Self::Result<()> {
        walk_statement_storage_live(self, location, local)
    }

    fn visit_statement_storage_dead(
        &mut self,
        location: Location,
        local: &mut Local,
    ) -> Self::Result<()> {
        walk_statement_storage_dead(self, location, local)
    }

    fn visit_rvalue(&mut self, location: Location, rvalue: &mut RValue<'heap>) -> Self::Result<()> {
        walk_rvalue(self, location, rvalue)
    }

    fn visit_rvalue_binary(
        &mut self,
        location: Location,
        binary: &mut Binary<'heap>,
    ) -> Self::Result<()> {
        walk_rvalue_binary(self, location, binary)
    }

    fn visit_rvalue_unary(
        &mut self,
        location: Location,
        unary: &mut Unary<'heap>,
    ) -> Self::Result<()> {
        walk_rvalue_unary(self, location, unary)
    }

    fn visit_rvalue_aggregate(
        &mut self,
        location: Location,
        aggregate: &mut Aggregate<'heap>,
    ) -> Self::Result<()> {
        walk_rvalue_aggregate(self, location, aggregate)
    }

    fn visit_rvalue_input(
        &mut self,
        location: Location,
        input: &mut Input<'heap>,
    ) -> Self::Result<()> {
        walk_rvalue_input(self, location, input)
    }

    fn visit_rvalue_apply(
        &mut self,
        location: Location,
        apply: &mut Apply<'heap>,
    ) -> Self::Result<()> {
        walk_rvalue_apply(self, location, apply)
    }

    fn visit_terminator(
        &mut self,
        location: Location,
        terminator: &mut Terminator<'heap>,
    ) -> Self::Result<()> {
        walk_terminator(self, location, terminator)
    }

    fn visit_terminator_goto(
        &mut self,
        location: Location,
        goto: &mut Goto<'heap>,
    ) -> Self::Result<()> {
        walk_terminator_goto(self, location, goto)
    }

    fn visit_terminator_switch_int(
        &mut self,
        location: Location,
        branch: &mut SwitchInt<'heap>,
    ) -> Self::Result<()> {
        walk_terminator_switch_int(self, location, branch)
    }

    fn visit_terminator_return(
        &mut self,
        location: Location,
        r#return: &mut Return<'heap>,
    ) -> Self::Result<()> {
        walk_terminator_return(self, location, r#return)
    }

    fn visit_terminator_graph_read(
        &mut self,
        location: Location,
        graph_read: &mut GraphRead<'heap>,
    ) -> Self::Result<()> {
        walk_terminator_graph_read(self, location, graph_read)
    }

    fn visit_graph_read_head(
        &mut self,
        location: GraphReadLocation,
        head: &mut GraphReadHead<'heap>,
    ) -> Self::Result<()> {
        walk_graph_read_head(self, location, head)
    }

    fn visit_graph_read_body(
        &mut self,
        location: GraphReadLocation,
        body: &mut GraphReadBody,
    ) -> Self::Result<()> {
        walk_graph_read_body(self, location, body)
    }

    // The mut version would be `tail: &mut GraphReadTail`
    fn visit_graph_read_tail(
        &mut self,
        location: GraphReadLocation,
        tail: &mut GraphReadTail,
    ) -> Self::Result<()> {
        walk_graph_read_tail(self, location, tail)
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_terminator_unreachable(&mut self, location: Location) -> Self::Result<()> {
        // leaf: nothing to do
        Ok!()
    }
}

fn beef_try_map<'heap: 'visitor, 'visitor, V: VisitorMut<'heap> + ?Sized, T>(
    visitor: &'visitor mut V,
    interner: impl FnOnce(&'visitor Interner<'heap>) -> &'visitor InternSet<'heap, [T]>,
    slice: &mut Interned<'heap, [T]>,
    mut on_item: impl FnMut(&mut V, T) -> V::Result<T>,
) -> V::Result<()>
where
    T: Copy + Eq + Hash + 'heap,
{
    // For a brief amount of time we put the slice into an invalid state, that is fine, as this
    // change cannot be observed, due to the fact that we *always* restore it.
    // This will leave the tree in an invalid state if `on_item` panics. This is considered a fine
    // trade-off, as a tree should not be used anymore if any panics occur (as they indicate ICE).
    let backup = *slice;
    let mut beef = Beef::new(mem::replace(slice, Interned::new_unchecked(&[])));

    let flow = beef
        .try_map::<_, V::Result<()>>(|item| on_item(visitor, item))
        .branch();

    match flow {
        ControlFlow::Continue(()) => {
            // We can safely finish
            *slice = beef.finish(interner(visitor.interner()));
            Ok!()
        }
        ControlFlow::Break(err) => {
            // Restore the original slice
            *slice = backup;
            V::Result::from_residual(err)
        }
    }
}

fn beef_try_scan<'heap: 'visitor, 'visitor, V: VisitorMut<'heap> + ?Sized, T>(
    visitor: &'visitor mut V,
    interner: impl FnOnce(&'visitor Interner<'heap>) -> &'visitor InternSet<'heap, [T]>,
    slice: &mut Interned<'heap, [T]>,
    mut on_item: impl FnMut(&mut V, &[T], T) -> V::Result<T>,
) -> V::Result<()>
where
    T: Copy + Eq + Hash + 'heap,
{
    // For a brief amount of time we put the slice into an invalid state, that is fine, as this
    // change cannot be observed, due to the fact that we *always* restore it.
    // This will leave the tree in an invalid state if `on_item` panics. This is considered a fine
    // trade-off, as a tree should not be used anymore if any panics occur (as they indicate ICE).
    let backup = *slice;
    let mut beef = Beef::new(mem::replace(slice, Interned::new_unchecked(&[])));

    let flow = beef
        .try_scan::<_, V::Result<()>>(|prefix, item| on_item(visitor, prefix, item))
        .branch();

    match flow {
        ControlFlow::Continue(()) => {
            // We can safely finish
            *slice = beef.finish(interner(visitor.interner()));
            Ok!()
        }
        ControlFlow::Break(err) => {
            // Restore the original slice
            *slice = backup;
            V::Result::from_residual(err)
        }
    }
}

pub fn walk_params<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    params: &mut Interned<'heap, [Local]>,
) -> T::Result<()> {
    if !T::Filter::FOLD_INTERNED {
        return Ok!();
    }

    beef_try_map(
        visitor,
        |interner| &interner.locals,
        params,
        |visitor, mut local| {
            visitor.visit_local(
                location,
                PlaceContext::Write(PlaceWriteContext::BlockParam),
                &mut local,
            )?;

            Try::from_output(local)
        },
    )
}

pub fn walk_body<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    Body {
        span,
        return_type: r#type,
        source,
        local_decls,
        basic_blocks,
        args: _,
    }: &mut Body<'heap>,
) -> T::Result<()> {
    visitor.visit_span(span)?;
    visitor.visit_type_id(r#type)?;
    visitor.visit_source(source)?;

    for (id, local_decl) in local_decls.iter_enumerated_mut() {
        visitor.visit_local_decl(id, local_decl)?;
    }

    for (id, basic_block) in basic_blocks.as_mut().iter_enumerated_mut() {
        visitor.visit_basic_block(id, basic_block)?;
    }

    Ok!()
}

pub fn walk_body_preserving_cfg<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    Body {
        span,
        return_type: r#type,
        source,
        local_decls,
        basic_blocks,
        args: _,
    }: &mut Body<'heap>,
) -> T::Result<()> {
    visitor.visit_span(span)?;
    visitor.visit_type_id(r#type)?;
    visitor.visit_source(source)?;

    for (id, local_decl) in local_decls.iter_enumerated_mut() {
        visitor.visit_local_decl(id, local_decl)?;
    }

    for (id, basic_block) in basic_blocks.as_mut_preserving_cfg().iter_enumerated_mut() {
        visitor.visit_basic_block(id, basic_block)?;
    }

    Ok!()
}

pub fn walk_local_decl<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    _local: Local,
    LocalDecl {
        span,
        r#type,
        name: _,
    }: &mut LocalDecl<'heap>,
) -> T::Result<()> {
    visitor.visit_span(span)?;
    visitor.visit_type_id(r#type)?;

    // We do not visit the name, because there is no location associated with it

    Ok!()
}

pub fn walk_basic_block<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    id: BasicBlockId,
    BasicBlock {
        params,
        statements,
        terminator,
    }: &mut BasicBlock<'heap>,
) -> T::Result<()> {
    let mut location = Location {
        block: id,
        statement_index: 0,
    };

    // We do not visit the basic block id here because it **cannot** be changed
    visitor.visit_basic_block_params(location, params)?;

    location.statement_index += 1;

    for statement in statements {
        visitor.visit_statement(location, statement)?;
        location.statement_index += 1;
    }

    visitor.visit_terminator(location, terminator)?;

    Ok!()
}

pub fn walk_projection<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    _context: PlaceContext,
    _base: PlaceRef<'_, 'heap>,
    Projection {
        mut r#type,
        mut kind,
    }: Projection<'heap>,
) -> T::Result<Projection<'heap>> {
    visitor.visit_type_id(&mut r#type)?;

    match &mut kind {
        ProjectionKind::Field(_) => {}
        ProjectionKind::FieldByName(name) => visitor.visit_symbol(location, name)?,
        ProjectionKind::Index(local) => {
            visitor.visit_local(location, PlaceContext::Read(PlaceReadContext::Load), local)?;
        }
    }

    T::Result::from_output(Projection { r#type, kind })
}

pub fn walk_place<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    mut context: PlaceContext,
    Place { local, projections }: &mut Place<'heap>,
) -> T::Result<()> {
    // If the context is a use (aka read or write) change to a projection (if it really is a
    // projection)
    if context.is_use() && !projections.is_empty() {
        context = if context.is_write() {
            PlaceContext::Write(PlaceWriteContext::Projection)
        } else {
            PlaceContext::Read(PlaceReadContext::Projection)
        };
    }

    visitor.visit_local(location, context, local)?;

    if !T::Filter::FOLD_INTERNED {
        return Ok!();
    }

    beef_try_scan(
        visitor,
        |interner| &interner.projections,
        projections,
        |visitor, prefix, projection| {
            let base = PlaceRef {
                local: *local,
                projections: prefix,
            };

            visitor.fold_projection(location, context, base, projection)
        },
    )
}

pub fn walk_constant<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    constant: &mut Constant<'heap>,
) -> T::Result<()> {
    match constant {
        Constant::Primitive(primitive) => visitor.visit_primitive(location, primitive),
        Constant::Unit => visitor.visit_unit(location),
        Constant::FnPtr(def_id) => visitor.visit_def_id(location, def_id),
    }
}

pub fn walk_operand<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    operand: &mut Operand<'heap>,
) -> T::Result<()> {
    match operand {
        Operand::Place(place) => {
            visitor.visit_place(location, PlaceContext::Read(PlaceReadContext::Load), place)
        }
        Operand::Constant(constant) => visitor.visit_constant(location, constant),
    }
}

pub fn walk_target<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Target { block, args }: &mut Target<'heap>,
) -> T::Result<()> {
    visitor.visit_basic_block_id(location, block);

    if !T::Filter::FOLD_INTERNED {
        return Ok!();
    }

    beef_try_map(
        visitor,
        |interner| &interner.operands,
        args,
        |visitor, mut arg| {
            visitor.visit_operand(location, &mut arg)?;
            T::Result::from_output(arg)
        },
    )
}

pub fn walk_statement<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Statement { span, kind }: &mut Statement<'heap>,
) -> T::Result<()> {
    visitor.visit_span(span)?;

    match kind {
        StatementKind::Assign(assign) => visitor.visit_statement_assign(location, assign),
        StatementKind::Nop => visitor.visit_statement_nop(location),
        StatementKind::StorageLive(local) => visitor.visit_statement_storage_live(location, local),
        StatementKind::StorageDead(local) => visitor.visit_statement_storage_dead(location, local),
    }
}

pub fn walk_statement_assign<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Assign { lhs, rhs }: &mut Assign<'heap>,
) -> T::Result<()> {
    visitor.visit_place(
        location,
        PlaceContext::Write(PlaceWriteContext::Assign),
        lhs,
    )?;
    visitor.visit_rvalue(location, rhs)?;

    Ok!()
}

pub fn walk_statement_storage_live<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    local: &mut Local,
) -> T::Result<()> {
    visitor.visit_local(
        location,
        PlaceContext::Liveness(PlaceLivenessContext::Begin),
        local,
    )?;

    Ok!()
}

pub fn walk_statement_storage_dead<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    local: &mut Local,
) -> T::Result<()> {
    visitor.visit_local(
        location,
        PlaceContext::Liveness(PlaceLivenessContext::End),
        local,
    )?;

    Ok!()
}

pub fn walk_rvalue<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    rvalue: &mut RValue<'heap>,
) -> T::Result<()> {
    match rvalue {
        RValue::Load(operand) => visitor.visit_operand(location, operand),
        RValue::Binary(binary) => visitor.visit_rvalue_binary(location, binary),
        RValue::Unary(unary) => visitor.visit_rvalue_unary(location, unary),
        RValue::Aggregate(aggregate) => visitor.visit_rvalue_aggregate(location, aggregate),
        RValue::Input(input) => visitor.visit_rvalue_input(location, input),
        RValue::Apply(apply) => visitor.visit_rvalue_apply(location, apply),
    }
}

pub fn walk_rvalue_binary<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Binary { op: _, left, right }: &mut Binary<'heap>,
) -> T::Result<()> {
    visitor.visit_operand(location, left)?;
    visitor.visit_operand(location, right)?;

    Ok!()
}

pub fn walk_rvalue_unary<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Unary { op: _, operand }: &mut Unary<'heap>,
) -> T::Result<()> {
    visitor.visit_operand(location, operand)?;

    Ok!()
}

pub fn walk_rvalue_aggregate<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Aggregate { kind, operands }: &mut Aggregate<'heap>,
) -> T::Result<()> {
    match kind {
        AggregateKind::Struct { fields } => {
            if T::Filter::FOLD_INTERNED {
                beef_try_map(
                    visitor,
                    |interner| &interner.symbols,
                    fields,
                    |visitor, mut field| {
                        visitor.visit_symbol(location, &mut field)?;
                        T::Result::from_output(field)
                    },
                )?;
            }
        }
        AggregateKind::Opaque(name) => {
            visitor.visit_symbol(location, name)?;
        }
        AggregateKind::Tuple
        | AggregateKind::List
        | AggregateKind::Dict
        | AggregateKind::Closure => {}
    }

    for operand in operands.iter_mut() {
        visitor.visit_operand(location, operand)?;
    }

    Ok!()
}

pub fn walk_rvalue_input<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Input { op: _, name }: &mut Input<'heap>,
) -> T::Result<()> {
    visitor.visit_symbol(location, name)?;

    Ok!()
}

pub fn walk_rvalue_apply<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Apply {
        function,
        arguments,
    }: &mut Apply<'heap>,
) -> T::Result<()> {
    visitor.visit_operand(location, function)?;

    for argument in arguments.iter_mut() {
        visitor.visit_operand(location, argument)?;
    }

    Ok!()
}

pub fn walk_terminator<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Terminator { span, kind }: &mut Terminator<'heap>,
) -> T::Result<()> {
    visitor.visit_span(span)?;

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

pub fn walk_terminator_goto<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Goto { target }: &mut Goto<'heap>,
) -> T::Result<()> {
    visitor.visit_target(location, target)?;
    Ok!()
}

pub fn walk_terminator_switch_int<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    SwitchInt {
        discriminant,
        targets,
    }: &mut SwitchInt<'heap>,
) -> T::Result<()> {
    visitor.visit_operand(location, discriminant)?;

    for target in targets.targets_mut() {
        visitor.visit_target(location, target)?;
    }

    Ok!()
}

pub fn walk_terminator_return<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    Return { value }: &mut Return<'heap>,
) -> T::Result<()> {
    visitor.visit_operand(location, value)?;
    Ok!()
}

pub fn walk_terminator_graph_read<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: Location,
    GraphRead {
        head,
        body,
        tail,
        target,
    }: &mut GraphRead<'heap>,
) -> T::Result<()> {
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

    visitor.visit_graph_read_tail(location, tail)?;
    visitor.visit_basic_block_id(location.base, target)?;

    Ok!()
}

pub fn walk_graph_read_head<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: GraphReadLocation,
    head: &mut GraphReadHead<'heap>,
) -> T::Result<()> {
    match head {
        GraphReadHead::Entity { axis } => visitor.visit_operand(location.base, axis),
    }
}

pub fn walk_graph_read_body<'heap, T: VisitorMut<'heap> + ?Sized>(
    visitor: &mut T,
    location: GraphReadLocation,
    body: &mut GraphReadBody,
) -> T::Result<()> {
    match body {
        GraphReadBody::Filter(func, env) => {
            visitor.visit_def_id(location.base, func)?;
            visitor.visit_local(
                location.base,
                PlaceContext::Read(PlaceReadContext::Load),
                env,
            )
        }
    }
}

#[expect(clippy::needless_pass_by_ref_mut, reason = "API uniformity")]
pub fn walk_graph_read_tail<'heap, T: VisitorMut<'heap> + ?Sized>(
    _visitor: &mut T,
    _location: GraphReadLocation,
    tail: &mut GraphReadTail,
) -> T::Result<()> {
    match tail {
        GraphReadTail::Collect => Ok!(),
    }
}
