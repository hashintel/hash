"""Temporal workflow definitions."""

from pydantic import BaseModel, Field
from temporalio import workflow

from app.typesystem import DataTypeSchema, EntityTypeSchema, PropertyTypeSchema

with workflow.unsafe.imports_passed_through():
    pass


class DataTypeWorkflowParameters(BaseModel):
    """Parameters for ontology type workflows."""

    data_type_id: str = Field(..., alias="dataTypeId")
    actor_id: str = Field(..., alias="actorId")


@workflow.defn(name="getDataType")
class DataTypeWorkflow:
    """A workflow that reads a data type from the provided URL."""

    # TODO: Use Temporal's guide to convert between JSON and Pydantic objects.
    # https://github.com/temporalio/samples-python/tree/main/pydantic_converter
    @workflow.run
    async def get_data_type(self, params: DataTypeWorkflowParameters) -> str:
        """Calls the Graph API to get a data type schema."""
        data_type_schema = DataTypeSchema(
            **(
                await workflow.execute_child_workflow(
                    task_queue="ai",
                    workflow="getDataType",
                    arg=params.dict(by_alias=True, exclude_none=True),
                )
            )["schema"],
        )
        print(  # noqa: T201
            data_type_schema.json(by_alias=True, exclude_none=True, indent=2),
        )
        return data_type_schema.json(by_alias=True, exclude_none=True)


class PropertyTypeWorkflowParameters(BaseModel):
    """Parameters for ontology type workflows."""

    proeprty_type_id: str = Field(..., alias="propertyTypeId")
    actor_id: str = Field(..., alias="actorId")


@workflow.defn(name="getPropertyType")
class PropertyTypeWorkflow:
    """A workflow that reads a property type from the provided URL."""

    # TODO: Use Temporal's guide to convert between JSON and Pydantic objects.
    # https://github.com/temporalio/samples-python/tree/main/pydantic_converter
    @workflow.run
    async def get_property_type(self, params: PropertyTypeWorkflowParameters) -> str:
        """Calls the Graph API to get a property type schema."""
        property_type_schema = PropertyTypeSchema(
            **(
                await workflow.execute_child_workflow(
                    task_queue="ai",
                    workflow="getPropertyType",
                    arg=params.dict(by_alias=True, exclude_none=True),
                )
            )["schema"],
        )
        print(  # noqa: T201
            property_type_schema.json(by_alias=True, exclude_none=True, indent=2),
        )
        return property_type_schema.json(by_alias=True, exclude_none=True)


class EntityTypeWorkflowParameters(BaseModel):
    """Parameters for ontology type workflows."""

    entity_type_id: str = Field(..., alias="entityTypeId")
    actor_id: str = Field(..., alias="actorId")


@workflow.defn(name="getEntityType")
class EntityTypeWorkflow:
    """A workflow that reads an entity type from the provided URL."""

    # TODO: Use Temporal's guide to convert between JSON and Pydantic objects.
    # https://github.com/temporalio/samples-python/tree/main/pydantic_converter
    @workflow.run
    async def get_entity_type(self, params: EntityTypeWorkflowParameters) -> str:
        """Calls the Graph API to get an entity type schema."""
        entity_type_schema = EntityTypeSchema(
            **(
                await workflow.execute_child_workflow(
                    task_queue="ai",
                    workflow="getEntityType",
                    arg=params.dict(by_alias=True, exclude_none=True),
                )
            )["schema"],
        )
        print(  # noqa: T201
            entity_type_schema.json(by_alias=True, exclude_none=True, indent=2),
        )
        return entity_type_schema.json(by_alias=True, exclude_none=True)
