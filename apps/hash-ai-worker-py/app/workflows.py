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

with workflow.unsafe.imports_passed_through():
    from app.typesystem.data_type import DataTypeReference
    from app.typesystem.entity_type import EntityTypeReference
    from app.typesystem.property_type import PropertyTypeReference


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
        ).create_model(actor_id=params.actor_id)

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
        ).create_model(actor_id=params.actor_id)

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
        ).create_model(actor_id=params.actor_id)

        print_schema(entity_type_model, params.entity_type)

        return entity_type_model.model_json_schema()
