use core::alloc::Allocator;

use crate::{
    module::std_lib::{
        ItemDef, ModuleCache, ModuleDef, StandardLibraryContext, StandardLibraryModule,
    },
    symbol::{Symbol, sym},
};

pub mod types {
    use crate::{
        symbol::sym,
        r#type::{TypeBuilder, TypeId},
    };

    #[must_use]
    pub fn timestamp(ty: &TypeBuilder<'_, '_>) -> TypeId {
        ty.opaque(sym::path::Timestamp, ty.integer())
    }

    #[must_use]
    pub fn unbounded_temporal_bound(ty: &TypeBuilder<'_, '_>) -> TypeId {
        ty.opaque(sym::path::UnboundedTemporalBound, ty.null())
    }

    #[must_use]
    pub fn inclusive_temporal_bound(ty: &TypeBuilder<'_, '_>) -> TypeId {
        ty.opaque(sym::path::InclusiveTemporalBound, self::timestamp(ty))
    }

    #[must_use]
    pub fn exclusive_temporal_bound(ty: &TypeBuilder<'_, '_>) -> TypeId {
        ty.opaque(sym::path::ExclusiveTemporalBound, self::timestamp(ty))
    }

    #[must_use]
    pub fn temporal_bound(ty: &TypeBuilder<'_, '_>) -> TypeId {
        ty.union([
            self::unbounded_temporal_bound(ty),
            self::inclusive_temporal_bound(ty),
            self::exclusive_temporal_bound(ty),
        ])
    }

    #[must_use]
    pub fn finite_temporal_bound(ty: &TypeBuilder<'_, '_>) -> TypeId {
        ty.union([
            self::inclusive_temporal_bound(ty),
            self::exclusive_temporal_bound(ty),
        ])
    }

    // newtype DecisionTime<T> = T
    #[must_use]
    pub fn decision_time(ty: &TypeBuilder<'_, '_>, inner: TypeId) -> TypeId {
        ty.opaque(sym::path::DecisionTime, inner)
    }

    // newtype TransactionTime<T> = T
    #[must_use]
    pub fn transaction_time(ty: &TypeBuilder<'_, '_>, inner: TypeId) -> TypeId {
        ty.opaque(sym::path::TransactionTime, inner)
    }

    /// `newtype Interval<S, E> = (start: S, end: E)`.
    ///
    /// Generic over the start and end bound types. Callers pass concrete types
    /// to monomorphize (e.g. `InclusiveTemporalBound` for start,
    /// `OpenTemporalBound` for end).
    #[must_use]
    pub fn interval(ty: &TypeBuilder<'_, '_>, start: TypeId, end: TypeId) -> TypeId {
        ty.opaque(
            sym::path::Interval,
            ty.r#struct([(sym::start, start), (sym::end, end)]),
        )
    }

    /// `type OpenTemporalBound = ExclusiveTemporalBound | UnboundedTemporalBound`.
    #[must_use]
    pub fn open_temporal_bound(ty: &TypeBuilder<'_, '_>) -> TypeId {
        ty.union([
            self::exclusive_temporal_bound(ty),
            self::unbounded_temporal_bound(ty),
        ])
    }

    /// `type LeftClosedTemporalInterval = Interval<InclusiveTemporalBound, OpenTemporalBound>`.
    #[must_use]
    pub fn left_closed_temporal_interval(ty: &TypeBuilder<'_, '_>) -> TypeId {
        self::interval(
            ty,
            self::inclusive_temporal_bound(ty),
            self::open_temporal_bound(ty),
        )
    }

    /// `type RightBoundedTemporalInterval = Interval<TemporalBound, FiniteTemporalBound>`.
    #[must_use]
    pub fn right_bounded_temporal_interval(ty: &TypeBuilder<'_, '_>) -> TypeId {
        self::interval(
            ty,
            self::temporal_bound(ty),
            self::finite_temporal_bound(ty),
        )
    }
}

pub(in crate::module::std_lib) struct Temporal {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Temporal {
    type Children = ();

    fn name() -> Symbol<'heap> {
        sym::temporal
    }

    #[expect(clippy::too_many_lines, clippy::similar_names)]
    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        _: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        let mut def = ModuleDef::new_in(context.alloc.clone());

        // newtype Timestamp = Integer
        //
        // TODO: replace with a dedicated primitive type in the future.
        let timestamp_ty = types::timestamp(&context.ty);
        def.push(
            sym::Timestamp,
            ItemDef::newtype(context.ty.env, timestamp_ty, &[]),
        );

        // newtype DecisionTime<T> = T
        let dt_t_arg = context.ty.fresh_argument(sym::T);
        let dt_t_ref = context.ty.hydrate_argument(dt_t_arg);
        let dt_t_param = context.ty.param(dt_t_arg);

        let decision_time_ty = context.ty.generic(
            [(dt_t_arg, None)],
            types::decision_time(&context.ty, dt_t_param),
        );
        def.push(
            sym::DecisionTime,
            ItemDef::newtype(context.ty.env, decision_time_ty, &[dt_t_ref]),
        );

        // newtype TransactionTime<T> = T
        let tt_t_arg = context.ty.fresh_argument(sym::T);
        let tt_t_ref = context.ty.hydrate_argument(tt_t_arg);
        let tt_t_param = context.ty.param(tt_t_arg);

        let transaction_time_ty = context.ty.generic(
            [(tt_t_arg, None)],
            types::transaction_time(&context.ty, tt_t_param),
        );
        def.push(
            sym::TransactionTime,
            ItemDef::newtype(context.ty.env, transaction_time_ty, &[tt_t_ref]),
        );

        // newtype UnboundedTemporalBound = Null
        let unbounded_bound_ty = types::unbounded_temporal_bound(&context.ty);
        def.push(
            sym::UnboundedTemporalBound,
            ItemDef::newtype(context.ty.env, unbounded_bound_ty, &[]),
        );

        // newtype InclusiveTemporalBound = Timestamp
        let inclusive_bound_ty = types::inclusive_temporal_bound(&context.ty);
        def.push(
            sym::InclusiveTemporalBound,
            ItemDef::newtype(context.ty.env, inclusive_bound_ty, &[]),
        );

        // newtype ExclusiveTemporalBound = Timestamp
        let exclusive_bound_ty = types::exclusive_temporal_bound(&context.ty);
        def.push(
            sym::ExclusiveTemporalBound,
            ItemDef::newtype(context.ty.env, exclusive_bound_ty, &[]),
        );

        // type TemporalBound = UnboundedTemporalBound | InclusiveTemporalBound
        //                    | ExclusiveTemporalBound
        let temporal_bound_ty =
            context
                .ty
                .union([unbounded_bound_ty, inclusive_bound_ty, exclusive_bound_ty]);
        def.push(
            sym::TemporalBound,
            ItemDef::r#type(context.ty.env, temporal_bound_ty, &[]),
        );

        // type FiniteTemporalBound = InclusiveTemporalBound | ExclusiveTemporalBound
        let finite_bound_ty = context.ty.union([inclusive_bound_ty, exclusive_bound_ty]);
        def.push(
            sym::FiniteTemporalBound,
            ItemDef::r#type(context.ty.env, finite_bound_ty, &[]),
        );

        // type OpenTemporalBound = ExclusiveTemporalBound | UnboundedTemporalBound
        let open_bound_ty = context.ty.union([exclusive_bound_ty, unbounded_bound_ty]);
        def.push(
            sym::OpenTemporalBound,
            ItemDef::r#type(context.ty.env, open_bound_ty, &[]),
        );

        // newtype Interval<S, E> = (start: S, end: E)
        let interval_s_arg = context.ty.fresh_argument(sym::S);
        let interval_s_ref = context.ty.hydrate_argument(interval_s_arg);
        let interval_s_param = context.ty.param(interval_s_arg);

        let interval_e_arg = context.ty.fresh_argument(sym::E);
        let interval_e_ref = context.ty.hydrate_argument(interval_e_arg);
        let interval_e_param = context.ty.param(interval_e_arg);

        let interval_ty = context.ty.generic(
            [(interval_s_arg, None), (interval_e_arg, None)],
            types::interval(&context.ty, interval_s_param, interval_e_param),
        );
        def.push(
            sym::Interval,
            ItemDef::newtype(
                context.ty.env,
                interval_ty,
                &[interval_s_ref, interval_e_ref],
            ),
        );

        // type LeftClosedTemporalInterval =
        //     Interval<InclusiveTemporalBound, OpenTemporalBound>
        let left_closed_interval_ty =
            types::interval(&context.ty, inclusive_bound_ty, open_bound_ty);
        def.push(
            sym::LeftClosedTemporalInterval,
            ItemDef::r#type(context.ty.env, left_closed_interval_ty, &[]),
        );

        // type RightBoundedTemporalInterval =
        //     Interval<TemporalBound, FiniteTemporalBound>
        let right_bounded_interval_ty =
            types::interval(&context.ty, temporal_bound_ty, finite_bound_ty);
        def.push(
            sym::RightBoundedTemporalInterval,
            ItemDef::r#type(context.ty.env, right_bounded_interval_ty, &[]),
        );

        // newtype PinnedTransactionTimeTemporalAxes = (
        //   pinned: TransactionTime<Timestamp>,
        //   variable: DecisionTime<RightBoundedTemporalInterval>,
        // )
        let pinned_tx_ty = context.ty.opaque(
            sym::path::PinnedTransactionTimeTemporalAxes,
            context.ty.r#struct([
                (
                    sym::pinned,
                    types::transaction_time(&context.ty, timestamp_ty),
                ),
                (
                    sym::variable,
                    types::decision_time(&context.ty, right_bounded_interval_ty),
                ),
            ]),
        );
        def.push(
            sym::PinnedTransactionTimeTemporalAxes,
            ItemDef::newtype(context.ty.env, pinned_tx_ty, &[]),
        );

        // newtype PinnedDecisionTimeTemporalAxes = (
        //   pinned: DecisionTime<Timestamp>,
        //   variable: TransactionTime<RightBoundedTemporalInterval>,
        // )
        let pinned_dt_ty = context.ty.opaque(
            sym::path::PinnedDecisionTimeTemporalAxes,
            context.ty.r#struct([
                (sym::pinned, types::decision_time(&context.ty, timestamp_ty)),
                (
                    sym::variable,
                    types::transaction_time(&context.ty, right_bounded_interval_ty),
                ),
            ]),
        );
        def.push(
            sym::PinnedDecisionTimeTemporalAxes,
            ItemDef::newtype(context.ty.env, pinned_dt_ty, &[]),
        );

        // type QueryTemporalAxes = PinnedTransactionTimeTemporalAxes
        //                        | PinnedDecisionTimeTemporalAxes
        let query_temporal_axes_ty = context.ty.union([pinned_tx_ty, pinned_dt_ty]);
        def.push(
            sym::QueryTemporalAxes,
            ItemDef::r#type(context.ty.env, query_temporal_axes_ty, &[]),
        );

        def
    }
}
