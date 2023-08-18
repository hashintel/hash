"""Temporal workflow definitions."""

import json
from typing import Any
from uuid import UUID

from pydantic import (
    BaseModel,
    Extra,
    Field,
    ValidationError,
)
from temporalio import workflow

from ._status import Status, StatusCode

with workflow.unsafe.imports_passed_through():
    from graph_types import (
        DataTypeReference,
        DataTypeSchema,
        EntityTypeReference,
        EntityTypeSchema,
        PropertyTypeReference,
        PropertyTypeSchema,
    )


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
        return DataTypeSchema(
            **(
                await workflow.execute_child_workflow(
                    task_queue="ai",
                    workflow="getDataType",
                    arg={
                        "dataTypeId": data_type_id,
                        "actorId": actor_id,
                    },
                )
            )["schema"],
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
        return PropertyTypeSchema(
            **(
                await workflow.execute_child_workflow(
                    task_queue="ai",
                    workflow="getPropertyType",
                    arg={
                        "propertyTypeId": property_type_id,
                        "actorId": actor_id,
                    },
                )
            )["schema"],
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
        return EntityTypeSchema(
            **(
                await workflow.execute_child_workflow(
                    task_queue="ai",
                    workflow="getEntityType",
                    arg={
                        "entityTypeId": entity_type_id,
                        "actorId": actor_id,
                    },
                )
            )["schema"],
        )


class DataTypeWorkflowParameters(BaseModel, extra=Extra.forbid):
    """Parameters for ontology type workflows."""

    data_type_id: str = Field(..., alias="dataTypeId")
    actor_id: UUID = Field(..., alias="actorId")
    data_type: Any = Field(..., alias="dataType")


def print_schema(model: type[BaseModel], data: Any) -> None:  # noqa: ANN401
    """Simple function to print the schema and the value of a BaseModel.

    This is meant for debugging purposes only and will be removed in the future.
    """
    print("schema:", json.dumps(model.model_json_schema(), indent=2))  # noqa: T201
    try:
        parsed_data = model.model_validate(data)
    except ValidationError as err:
        print(err)  # noqa: T201
    else:
        print(  # noqa: T201
            "value:",
            parsed_data.model_dump_json(by_alias=True, exclude_none=True, indent=2),
        )
        print(  # noqa: T201
            "value type:",
            type(parsed_data.model_dump()),
        )


@workflow.defn(name="getDataType")
class DataTypeWorkflow:
    """A workflow that reads a data type from the provided URL."""

    @workflow.run
    async def get_data_type(
        self,
        params: DataTypeWorkflowParameters,
    ) -> dict[str, Any]:
        """Calls the Graph API to get a data type schema."""
        data_type_model = await DataTypeReference(
            **{"$ref": params.data_type_id},
        ).create_model(actor_id=params.actor_id, graph=GraphApiWorkflow())

        print_schema(data_type_model, params.data_type)

        return data_type_model.model_json_schema()


class PropertyTypeWorkflowParameters(BaseModel, extra=Extra.forbid):
    """Parameters for ontology type workflows."""

    proeprty_type_id: str = Field(..., alias="propertyTypeId")
    actor_id: UUID = Field(..., alias="actorId")
    property_type: Any = Field(..., alias="propertyType")


@workflow.defn(name="getPropertyType")
class PropertyTypeWorkflow:
    """A workflow that reads a property type from the provided URL."""

    @workflow.run
    async def get_property_type(
        self,
        params: PropertyTypeWorkflowParameters,
    ) -> dict[str, Any]:
        """Calls the Graph API to get a data type schema."""
        property_type_model = await PropertyTypeReference(
            **{"$ref": params.proeprty_type_id},
        ).create_model(actor_id=params.actor_id, graph=GraphApiWorkflow())

        print_schema(property_type_model, params.property_type)

        return property_type_model.model_json_schema()


class EntityTypeWorkflowParameters(BaseModel, extra=Extra.forbid):
    """Parameters for ontology type workflows."""

    entity_type_id: str = Field(..., alias="entityTypeId")
    actor_id: UUID = Field(..., alias="actorId")
    entity_type: Any = Field(..., alias="entityType")


@workflow.defn(name="getEntityType")
class EntityTypeWorkflow:
    """A workflow that reads an entity type from the provided URL."""

    @workflow.run
    async def get_entity_type(
        self,
        params: EntityTypeWorkflowParameters,
    ) -> dict[str, Any]:
        """Calls the Graph API to get a data type schema."""
        entity_type_model = await EntityTypeReference(
            **{"$ref": params.entity_type_id},
        ).create_model(actor_id=params.actor_id, graph=GraphApiWorkflow())

        print_schema(entity_type_model, params.entity_type)

        return entity_type_model.model_json_schema()


class ProposedEntity(BaseModel, extra=Extra.forbid):
    """An entity proposed by AI."""

    entity_type_id: str = Field(..., alias="entityTypeId")
    properties: Any


class InferEntitiesWorkflowParameter(BaseModel, extra=Extra.forbid):
    """Parameters for entity inference workflow."""

    text_input: str = Field(..., alias="textInput")
    entity_type_ids: list[str] = Field(..., alias="entityTypeIds")
    actor_id: UUID = Field(..., alias="actorId")


class InferEntitiesWorkflowResult(BaseModel, extra=Extra.forbid):
    """Result of entity inference workflow."""

    entities: list[ProposedEntity]


@workflow.defn(name="inferEntities")
class InferEntitiesWorkflow:
    """Infers entities of the specified type(s) from the provided text input."""

    @workflow.run
    async def infer_entities(
        self,
        params: InferEntitiesWorkflowParameter,
    ) -> Status[InferEntitiesWorkflowResult]:
        """Infer entities from the provided text input."""
        if len(params.entity_type_ids) > 0:
            return Status(
                code=StatusCode.UNIMPLEMENTED,
                message="Entity inference is not yet implemented.",
            )

        return Status(
            code=StatusCode.INVALID_ARGUMENT,
            message="At least one entity type ID must be provided.",
        )
