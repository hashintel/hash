"""Temporal workflow definitions."""

from uuid import UUID

from pydantic import BaseModel, Extra, Field
from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from app.typesystem import DataTypeSchema, EntityTypeSchema, PropertyTypeSchema


class DataTypeWorkflowParameters(BaseModel, extra=Extra.forbid):
    """Parameters for ontology type workflows."""

    data_type_id: str = Field(..., alias="dataTypeId")
    actor_id: UUID = Field(..., alias="actorId")


@workflow.defn(name="getDataType")
class DataTypeWorkflow:
    """A workflow that reads a data type from the provided URL."""

    @workflow.run
    async def get_data_type(
        self,
        params: DataTypeWorkflowParameters,
    ) -> DataTypeSchema:
        """Calls the Graph API to get a data type schema."""
        data_type_schema = DataTypeSchema(
            **(
                await workflow.execute_child_workflow(
                    task_queue="ai",
                    workflow="getDataType",
                    arg=params,
                )
            )["schema"],
        )
        print(  # noqa: T201
            data_type_schema.model_dump_json(
                by_alias=True,
                exclude_none=True,
                indent=2,
            ),
        )
        return data_type_schema


class PropertyTypeWorkflowParameters(BaseModel, extra=Extra.forbid):
    """Parameters for ontology type workflows."""

    proeprty_type_id: str = Field(..., alias="propertyTypeId")
    actor_id: UUID = Field(..., alias="actorId")


@workflow.defn(name="getPropertyType")
class PropertyTypeWorkflow:
    """A workflow that reads a property type from the provided URL."""

    @workflow.run
    async def get_property_type(
        self,
        params: PropertyTypeWorkflowParameters,
    ) -> PropertyTypeSchema:
        """Calls the Graph API to get a property type schema."""
        property_type_schema = PropertyTypeSchema(
            **(
                await workflow.execute_child_workflow(
                    task_queue="ai",
                    workflow="getPropertyType",
                    arg=params,
                )
            )["schema"],
        )
        print(  # noqa: T201
            property_type_schema.model_dump_json(
                by_alias=True,
                exclude_none=True,
                indent=2,
            ),
        )
        return property_type_schema


class EntityTypeWorkflowParameters(BaseModel, extra=Extra.forbid):
    """Parameters for ontology type workflows."""

    entity_type_id: str = Field(..., alias="entityTypeId")
    actor_id: UUID = Field(..., alias="actorId")


@workflow.defn(name="getEntityType")
class EntityTypeWorkflow:
    """A workflow that reads an entity type from the provided URL."""

    @workflow.run
    async def get_entity_type(
        self,
        params: EntityTypeWorkflowParameters,
    ) -> EntityTypeSchema:
        """Calls the Graph API to get an entity type schema."""
        entity_type_schema = EntityTypeSchema(
            **(
                await workflow.execute_child_workflow(
                    task_queue="ai",
                    workflow="getEntityType",
                    arg=params,
                )
            )["schema"],
        )
        print(  # noqa: T201
            entity_type_schema.model_dump_json(
                by_alias=True,
                exclude_none=True,
                indent=2,
            ),
        )
        return entity_type_schema
