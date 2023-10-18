"""Basic activities to interact with the graph API."""

from datetime import timedelta
from typing import Any
from uuid import UUID

from graph_types import (
    DataTypeSchema,
    EntityTypeSchema,
    PropertyTypeSchema,
)
from temporalio import workflow

from worker._status import Status
from worker._util import delete_key, traverse_dict


class GraphApiActivities:
    """Defines the interface for a graph API."""

    def __init__(
        self,
        *,
        start_to_close_timeout: timedelta,
        validate_required: bool = True,
    ) -> None:
        """Initializes the graph API activities."""
        self.start_to_close_timeout = start_to_close_timeout
        self.validate_required = validate_required

    async def get_data_type(
        self,
        data_type_id: str,
        *,
        actor_id: UUID,
    ) -> DataTypeSchema:
        """Returns the data type schema for the given data type ID.

        If the data type is not found it will attempt to fetch it and use
        the actor ID to authenticate the request.
        """
        schema: dict[str, Any] = Status(
            **await workflow.execute_activity(
                task_queue="ai",
                activity="getDataTypeActivity",
                arg={
                    "dataTypeId": data_type_id,
                    "authentication": {"actorId": actor_id},
                },
                start_to_close_timeout=self.start_to_close_timeout,
            ),
        ).into_content()["schema"]
        if not self.validate_required:
            traverse_dict(
                schema,
                lambda key, _: key == "required",
                delete_key,
            )
        return DataTypeSchema(**schema)

    async def get_property_type(
        self,
        property_type_id: str,
        *,
        actor_id: UUID,
    ) -> PropertyTypeSchema:
        """Returns the property type schema for the given property type ID.

        If the property type is not found it will attempt to fetch it and use
        the actor ID to authenticate the request.
        """
        schema: dict[str, Any] = Status(
            **await workflow.execute_activity(
                task_queue="ai",
                activity="getPropertyTypeActivity",
                arg={
                    "propertyTypeId": property_type_id,
                    "authentication": {"actorId": actor_id},
                },
                start_to_close_timeout=self.start_to_close_timeout,
            ),
        ).into_content()["schema"]
        if not self.validate_required:
            traverse_dict(
                schema,
                lambda key, _: key == "required",
                delete_key,
            )
        return PropertyTypeSchema(**schema)

    async def get_entity_type(
        self,
        entity_type_id: str,
        *,
        actor_id: UUID,
    ) -> EntityTypeSchema:
        """Returns the entity type schema for the given entity type ID.

        If the entity type is not found it will attempt to fetch it and use
        the actor ID to authenticate the request.
        """
        schema: dict[str, Any] = Status(
            **await workflow.execute_activity(
                task_queue="ai",
                activity="getEntityTypeActivity",
                arg={
                    "entityTypeId": entity_type_id,
                    "authentication": {"actorId": actor_id},
                },
                start_to_close_timeout=self.start_to_close_timeout,
            ),
        ).into_content()["schema"]
        if not self.validate_required:
            traverse_dict(
                schema,
                lambda key, _: key == "required",
                delete_key,
            )
        return EntityTypeSchema(**schema)
