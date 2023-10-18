"""Ergonomic API to configure options for structural queries."""

from datetime import datetime
from typing import Protocol

from graph_client.models import (
    DecisionTime,
    EdgeResolveDepths,
    ExclusiveBound,
    GraphResolveDepths,
    InclusiveBound,
    LimitedTemporalBound,
    NullableTimestamp,
    OpenTemporalBound,
    OutgoingEdgeResolveDepth,
    QueryTemporalAxesUnresolved,
    QueryTemporalAxesUnresolvedDecisionTime,
    QueryTemporalAxesUnresolvedTransactionTime,
    Timestamp,
    TransactionTime,
    UnboundedBound,
    UnresolvedPinnedDecisionAxis,
    UnresolvedPinnedTransactionAxis,
    UnresolvedRightBoundedTemporalInterval,
    UnresolvedVariableDecisionAxis,
    UnresolvedVariableTransactionAxis,
)
from graph_client.models import (
    TemporalBound as FFITemporalBound,
)


class ToLimitedTemporalBound(Protocol):
    """Convert to a limited temporal bound.

    This is implemented by `InclusiveTemporalBound`, and `ExclusiveTemporalBound`.
    """

    def to_limited_temporal_bound(self) -> LimitedTemporalBound:
        """Convert to a limited temporal bound."""
        ...


class ToTemporalBound(Protocol):
    """Convert to a temporal bound.

    This is implemented by `UnboundedTemporalBound`,
    `InclusiveTemporalBound` and `ExclusiveTemporalBound`.
    """

    def to_temporal_bound(self) -> FFITemporalBound:
        """Convert to a temporal bound."""
        ...


class ToOpenTemporalBound(Protocol):
    """Convert to an open temporal bound.

    This is implemented by `UnboundedTemporalBound` and `ExclusiveTemporalBound`.
    """

    def to_open_temporal_bound(self) -> OpenTemporalBound:
        """Convert to an open temporal bound."""
        ...


class TemporalBound:
    """A temporal bound.

    Do not instantiate this class directly.
    Instead, use the class methods.
    """

    @classmethod
    def unbounded(cls) -> "UnboundedTemporalBound":
        """Return an unbounded interval."""
        return UnboundedTemporalBound()

    @classmethod
    def inclusive(cls, time: datetime) -> "InclusiveTemporalBound":
        """Return an inclusive interval."""
        return InclusiveTemporalBound(time)

    @classmethod
    def exclusive(cls, time: datetime) -> "ExclusiveTemporalBound":
        """Return an exclusive interval."""
        return ExclusiveTemporalBound(time)


# noinspection PyMethodMayBeStatic
class UnboundedTemporalBound(TemporalBound):
    """An unbounded temporal bound."""

    def to_temporal_bound(self) -> FFITemporalBound:
        """Convert to a temporal bound."""
        return FFITemporalBound(root=UnboundedBound(kind="unbounded"))

    def to_open_temporal_bound(self) -> OpenTemporalBound:
        """Convert to an open temporal bound."""
        return OpenTemporalBound(root=UnboundedBound(kind="unbounded"))


class InclusiveTemporalBound(TemporalBound):
    """An inclusive temporal bound."""

    time: datetime

    def __init__(self, time: datetime) -> None:
        """Initialize the bound."""
        self.time = time

    def to_temporal_bound(self) -> FFITemporalBound:
        """Convert to a temporal bound."""
        return FFITemporalBound(
            root=InclusiveBound(
                kind="inclusive",
                limit=Timestamp(root=self.time),
            ),
        )

    def to_limited_temporal_bound(self) -> LimitedTemporalBound:
        """Convert to a limited temporal bound."""
        return LimitedTemporalBound(
            root=InclusiveBound(
                kind="inclusive",
                limit=Timestamp(root=self.time),
            ),
        )


class ExclusiveTemporalBound(TemporalBound):
    """An exclusive temporal bound."""

    time: datetime

    def __init__(self, time: datetime) -> None:
        """Initialize the bound."""
        self.time = time

    def to_temporal_bound(self) -> FFITemporalBound:
        """Convert to a temporal bound."""
        return FFITemporalBound(
            root=ExclusiveBound(kind="exclusive", limit=Timestamp(root=self.time)),
        )

    def to_limited_temporal_bound(self) -> LimitedTemporalBound:
        """Convert to a limited temporal bound."""
        return LimitedTemporalBound(
            root=ExclusiveBound(
                kind="exclusive",
                limit=Timestamp(root=self.time),
            ),
        )

    def to_open_temporal_bound(self) -> OpenTemporalBound:
        """Convert to an open temporal bound."""
        return OpenTemporalBound(
            root=ExclusiveBound(
                kind="exclusive",
                limit=Timestamp(root=self.time),
            ),
        )


class PinnedTransactionTimeTemporalAxisBuilder:
    """A builder for a pinned transaction time, which is variable by decision time."""

    pinned: datetime | None = None

    def __init__(self, *, pinned: datetime | None = None) -> None:
        """Initialize the builder."""
        self.pinned = pinned

    def between(
        self,
        *,
        start: ToTemporalBound | None = None,
        end: ToLimitedTemporalBound | None = None,
    ) -> QueryTemporalAxesUnresolved:
        """Return all entities that are valid between the given times.

        If `start` is None, then the start of the interval is unbounded.
        If `end` is None, then the end will be the current time.
        """
        return QueryTemporalAxesUnresolved(
            root=QueryTemporalAxesUnresolvedDecisionTime(
                pinned=UnresolvedPinnedTransactionAxis(
                    axis=TransactionTime(root="transactionTime"),
                    timestamp=NullableTimestamp(root=self.pinned),
                ),
                variable=UnresolvedVariableDecisionAxis(
                    axis=DecisionTime(root="decisionTime"),
                    interval=UnresolvedRightBoundedTemporalInterval(
                        start=start.to_temporal_bound() if start else None,
                        end=end.to_limited_temporal_bound() if end else None,
                    ),
                ),
            ),
        )

    def current(self) -> QueryTemporalAxesUnresolved:
        """Return all entities that are valid at the current time."""
        return self.between(start=None, end=None)


class PinnedDecisionTimeTemporalAxisBuilder:
    """A builder for a pinned decision time, which is variable by transaction time."""

    pinned: datetime | None = None

    def __init__(self, *, pinned: datetime | None = None) -> None:
        """Initialize the builder."""
        self.pinned = pinned

    def between(
        self,
        *,
        start: ToTemporalBound | None = None,
        end: ToLimitedTemporalBound | None = None,
    ) -> QueryTemporalAxesUnresolved:
        """Return all entities that are valid between the given times.

        If `start` is None, then the start of the interval is unbounded.
        If `end` is None, then the end will be the current time.
        """
        return QueryTemporalAxesUnresolved(
            root=QueryTemporalAxesUnresolvedTransactionTime(
                pinned=UnresolvedPinnedDecisionAxis(
                    axis=DecisionTime(root="decisionTime"),
                    timestamp=NullableTimestamp(root=self.pinned),
                ),
                variable=UnresolvedVariableTransactionAxis(
                    axis=TransactionTime(root="transactionTime"),
                    interval=UnresolvedRightBoundedTemporalInterval(
                        start=start.to_temporal_bound() if start else None,
                        end=end.to_limited_temporal_bound() if end else None,
                    ),
                ),
            ),
        )

    def current(self) -> QueryTemporalAxesUnresolved:
        """Return all entities that are valid at the current time."""
        return self.between(start=None, end=None)


class TemporalAxesBuilder:
    """A builder for temporal axes."""

    @classmethod
    def pinned_transaction_time(
        cls,
        time: datetime | None = None,
    ) -> PinnedTransactionTimeTemporalAxisBuilder:
        """Return all entities that are available at the given transaction time."""
        return PinnedTransactionTimeTemporalAxisBuilder(pinned=time)

    @classmethod
    def pinned_decision_time(
        cls,
        time: datetime | None = None,
    ) -> PinnedDecisionTimeTemporalAxisBuilder:
        """Return all entities that are available at the given transaction time."""
        return PinnedDecisionTimeTemporalAxisBuilder(pinned=time)

    @classmethod
    def current(cls) -> QueryTemporalAxesUnresolved:
        """Only select the latest entities."""
        return PinnedDecisionTimeTemporalAxisBuilder(pinned=None).current()


class Options:
    """Options for queries."""

    graph_resolve_depth: GraphResolveDepths
    temporal_axes: QueryTemporalAxesUnresolved

    def __init__(self) -> None:
        """Initialize the options."""
        self.graph_resolve_depth = GraphResolveDepths(
            constrains_link_destinations_on=OutgoingEdgeResolveDepth(outgoing=0),
            constrains_links_on=OutgoingEdgeResolveDepth(outgoing=0),
            constrains_properties_on=OutgoingEdgeResolveDepth(outgoing=0),
            constrains_values_on=OutgoingEdgeResolveDepth(outgoing=0),
            has_left_entity=EdgeResolveDepths(incoming=0, outgoing=0),
            has_right_entity=EdgeResolveDepths(incoming=0, outgoing=0),
            inherits_from=OutgoingEdgeResolveDepth(outgoing=0),
            is_of_type=OutgoingEdgeResolveDepth(outgoing=0),
        )

        self.temporal_axes = TemporalAxesBuilder.current()

    def resolve_type_of_entity(self, *, enable: bool) -> None:
        """Return the entity type of the entity."""
        self.graph_resolve_depth.is_of_type = OutgoingEdgeResolveDepth(
            outgoing=0 if enable else 1,
        )

    def resolve_inheritance(self, *, depth: int) -> None:
        """Return the types a type inherits from.

        If `depth` is 0, then types an entity inherits from will not be resolved.
        """
        self.graph_resolve_depth.inherits_from = OutgoingEdgeResolveDepth(
            outgoing=depth,
        )

    def resolve_left_entity_of_link(
        self,
        *,
        incoming_depth: int = 0,
        outgoing_depth: int = 0,
    ) -> None:
        """Return the left entity of an entity, if it is a link.

        If `*_depth` is 0, then the right entity will not be resolved.
        """
        self.graph_resolve_depth.has_left_entity = EdgeResolveDepths(
            incoming=incoming_depth,
            outgoing=outgoing_depth,
        )

    def resolve_right_entity_of_link(
        self,
        *,
        incoming_depth: int = 0,
        outgoing_depth: int = 0,
    ) -> None:
        """Return the right entity of an entity, if it is a link.

        If `*_depth` is 0, then the right entity will not be resolved.
        """
        self.graph_resolve_depth.has_right_entity = EdgeResolveDepths(
            incoming=incoming_depth,
            outgoing=outgoing_depth,
        )

    def resolve_data_types(self, *, depth: int) -> None:
        """Return the data types of the entity.

        If `depth` is 0, then the data types will not be resolved.
        """
        self.graph_resolve_depth.constrains_values_on = OutgoingEdgeResolveDepth(
            outgoing=depth,
        )

    def resolve_property_types(self, *, depth: int) -> None:
        """Return the property types of the entity.

        If `depth` is 0, then the property types will not be resolved.
        """
        self.graph_resolve_depth.constrains_properties_on = OutgoingEdgeResolveDepth(
            outgoing=depth,
        )

    def resolve_link_types(self, *, depth: int) -> None:
        """Return the entity types of any link left or right entity.

        If `depth` is 0, then the link types will not be resolved.
        """
        self.graph_resolve_depth.constrains_links_on = OutgoingEdgeResolveDepth(
            outgoing=depth,
        )

    def resolve_link_destinations(self, *, depth: int) -> None:
        """Return the entity type of any link destination referenced by an entity type.

        If `depth` is 0, then the link destinations will not be resolved.
        """
        self.graph_resolve_depth.constrains_link_destinations_on = (
            OutgoingEdgeResolveDepth(outgoing=depth)
        )
