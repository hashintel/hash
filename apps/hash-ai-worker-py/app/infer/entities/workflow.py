"""Temporal workflow definitions."""
import asyncio
from datetime import timedelta
from typing import Any
from uuid import UUID

from temporalio import workflow

from app._status import Status, StatusCode

from . import (
    AuthenticationContext,
    InferEntitiesActivityParameter,
    InferEntitiesWorkflowParameter,
    ProposedEntity,
)

with workflow.unsafe.imports_passed_through():
    from graph_types import (
        DataTypeSchema,
        EntityTypeReference,
        EntityTypeSchema,
        PropertyTypeSchema,
    )


class StatusError(RuntimeError):
    """Error raised when a status code is not OK."""

    def __init__(self, status: Status[Any]) -> None:
        """Initializes the status error."""
        self.status = status
        super().__init__(status.message)


class GraphApiWorkflow:
    """Defines the interface for a graph API."""

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
        status = Status(
            **(
                await workflow.execute_child_workflow(
                    task_queue="ai",
                    workflow="getDataType",
                    arg={
                        "dataTypeId": data_type_id,
                        "authentication": {"actorId": actor_id},
                    },
                )
            ),
        )

        if status.code != StatusCode.OK:
            raise StatusError(status)

        return DataTypeSchema(
            **(status.contents[0]["schema"]),
        )

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
        status = Status(
            **(
                await workflow.execute_child_workflow(
                    task_queue="ai",
                    workflow="getPropertyType",
                    arg={
                        "propertyTypeId": property_type_id,
                        "authentication": {"actorId": actor_id},
                    },
                )
            ),
        )

        if status.code != StatusCode.OK:
            raise StatusError(status)

        return PropertyTypeSchema(
            **(status.contents[0]["schema"]),
        )

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
        status = Status(
            **(
                await workflow.execute_child_workflow(
                    task_queue="ai",
                    workflow="getEntityType",
                    arg={
                        "entityTypeId": entity_type_id,
                        "authentication": {"actorId": actor_id},
                    },
                )
            ),
        )

        if status.code != StatusCode.OK:
            raise StatusError(status)

        return EntityTypeSchema(
            **(status.contents[0]["schema"]),
        )


async def get_closed_entity_type(
    authentication: AuthenticationContext,
    entity_type_id: str,
) -> dict[str, Any]:
    model = await EntityTypeReference(
        **{"$ref": entity_type_id},
    ).create_model(
        actor_id=authentication.actor_id,
        graph=GraphApiWorkflow(),
    )
    return model.model_json_schema(by_alias=True)


@workflow.defn(name="inferEntities")
class InferEntitiesWorkflow:
    """Infers entities of the specified type(s) from the provided text input."""

    @workflow.run
    async def infer_entities(
        self,
        params: InferEntitiesWorkflowParameter,
    ) -> Status[ProposedEntity]:
        """Infer entities from the provided text input."""
        if len(params.entity_type_ids) == 0:
            return Status(
                code=StatusCode.INVALID_ARGUMENT,
                message="At least one entity type ID must be provided.",
            )

        try:
            entity_types = await asyncio.gather(
                *[
                    get_closed_entity_type(params.authentication, entity_type_id)
                    for entity_type_id in params.entity_type_ids
                ],
            )
        except StatusError as error:
            return error.status

        return await workflow.execute_activity(
            "inferEntities",
            InferEntitiesActivityParameter(
                textInput=params.text_input,
                entityTypes=entity_types,
            ),
            start_to_close_timeout=timedelta(minutes=1),
        )
