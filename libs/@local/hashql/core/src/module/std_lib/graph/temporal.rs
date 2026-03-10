use crate::{
    heap::Heap,
    module::std_lib::{ItemDef, ModuleDef, StandardLibrary, StandardLibraryModule},
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) struct Temporal {
    _dependencies: (),
}

impl<'heap> StandardLibraryModule<'heap> for Temporal {
    type Children = ();

    fn name(_heap: &'heap Heap) -> Symbol<'heap> {
        sym::temporal
    }

    #[expect(clippy::too_many_lines, reason = "cohesive block of type definitions")]
    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        // newtype Timestamp = Integer
        //
        // TODO: replace with a dedicated primitive type in the future.
        let timestamp_ty = lib.ty.opaque(sym::path::Timestamp, lib.ty.integer());
        def.push(
            sym::Timestamp,
            ItemDef::newtype(lib.ty.env, timestamp_ty, &[]),
        );

        // newtype DecisionTime<T> = T
        let dt_t_arg = lib.ty.fresh_argument(sym::T);
        let dt_t_ref = lib.ty.hydrate_argument(dt_t_arg);
        let dt_t_param = lib.ty.param(dt_t_arg);

        let decision_time_ty = lib.ty.generic(
            [(dt_t_arg, None)],
            lib.ty.opaque(sym::path::DecisionTime, dt_t_param),
        );
        def.push(
            sym::DecisionTime,
            ItemDef::newtype(lib.ty.env, decision_time_ty, &[dt_t_ref]),
        );

        // newtype TransactionTime<T> = T
        let tt_t_arg = lib.ty.fresh_argument(sym::T);
        let tt_t_ref = lib.ty.hydrate_argument(tt_t_arg);
        let tt_t_param = lib.ty.param(tt_t_arg);

        let transaction_time_ty = lib.ty.generic(
            [(tt_t_arg, None)],
            lib.ty.opaque(sym::path::TransactionTime, tt_t_param),
        );
        def.push(
            sym::TransactionTime,
            ItemDef::newtype(lib.ty.env, transaction_time_ty, &[tt_t_ref]),
        );

        // newtype UnboundedTemporalBound = Null
        let unbounded_bound_ty = lib
            .ty
            .opaque(sym::path::UnboundedTemporalBound, lib.ty.null());
        def.push(
            sym::UnboundedTemporalBound,
            ItemDef::newtype(lib.ty.env, unbounded_bound_ty, &[]),
        );

        // newtype InclusiveTemporalBound = Timestamp
        let inclusive_bound_ty = lib
            .ty
            .opaque(sym::path::InclusiveTemporalBound, timestamp_ty);
        def.push(
            sym::InclusiveTemporalBound,
            ItemDef::newtype(lib.ty.env, inclusive_bound_ty, &[]),
        );

        // newtype ExclusiveTemporalBound = Timestamp
        let exclusive_bound_ty = lib
            .ty
            .opaque(sym::path::ExclusiveTemporalBound, timestamp_ty);
        def.push(
            sym::ExclusiveTemporalBound,
            ItemDef::newtype(lib.ty.env, exclusive_bound_ty, &[]),
        );

        // type TemporalBound = UnboundedTemporalBound | InclusiveTemporalBound
        //                    | ExclusiveTemporalBound
        let temporal_bound_ty =
            lib.ty
                .union([unbounded_bound_ty, inclusive_bound_ty, exclusive_bound_ty]);
        def.push(
            sym::TemporalBound,
            ItemDef::r#type(lib.ty.env, temporal_bound_ty, &[]),
        );

        // type FiniteTemporalBound = InclusiveTemporalBound | ExclusiveTemporalBound
        let finite_bound_ty = lib.ty.union([inclusive_bound_ty, exclusive_bound_ty]);
        def.push(
            sym::FiniteTemporalBound,
            ItemDef::r#type(lib.ty.env, finite_bound_ty, &[]),
        );

        // newtype Interval = (start: TemporalBound, end: FiniteTemporalBound)
        let interval_ty = lib.ty.opaque(
            sym::path::Interval,
            lib.ty
                .r#struct([(sym::start, temporal_bound_ty), (sym::end, finite_bound_ty)]),
        );
        def.push(
            sym::Interval,
            ItemDef::newtype(lib.ty.env, interval_ty, &[]),
        );

        // newtype PinnedTransactionTimeTemporalAxes = (
        //   pinned: TransactionTime<Timestamp>,
        //   variable: DecisionTime<Interval>,
        // )
        let pinned_tx_ty = lib.ty.opaque(
            sym::path::PinnedTransactionTimeTemporalAxes,
            lib.ty.r#struct([
                (
                    sym::pinned,
                    lib.ty
                        .apply([(tt_t_arg, timestamp_ty)], transaction_time_ty),
                ),
                (
                    sym::variable,
                    lib.ty.apply([(dt_t_arg, interval_ty)], decision_time_ty),
                ),
            ]),
        );
        def.push(
            sym::PinnedTransactionTimeTemporalAxes,
            ItemDef::newtype(lib.ty.env, pinned_tx_ty, &[]),
        );

        // newtype PinnedDecisionTimeTemporalAxes = (
        //   pinned: DecisionTime<Timestamp>,
        //   variable: TransactionTime<Interval>,
        // )
        let pinned_dt_ty = lib.ty.opaque(
            sym::path::PinnedDecisionTimeTemporalAxes,
            lib.ty.r#struct([
                (
                    sym::pinned,
                    lib.ty.apply([(dt_t_arg, timestamp_ty)], decision_time_ty),
                ),
                (
                    sym::variable,
                    lib.ty.apply([(tt_t_arg, interval_ty)], transaction_time_ty),
                ),
            ]),
        );
        def.push(
            sym::PinnedDecisionTimeTemporalAxes,
            ItemDef::newtype(lib.ty.env, pinned_dt_ty, &[]),
        );

        // type QueryTemporalAxes = PinnedTransactionTimeTemporalAxes
        //                        | PinnedDecisionTimeTemporalAxes
        let query_temporal_axes_ty = lib.ty.union([pinned_tx_ty, pinned_dt_ty]);
        def.push(
            sym::QueryTemporalAxes,
            ItemDef::r#type(lib.ty.env, query_temporal_axes_ty, &[]),
        );

        def
    }
}
