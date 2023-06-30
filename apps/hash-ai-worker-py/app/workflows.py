"""Temporal workflow definitions."""

from temporalio import workflow

from .typesystem import DataTypeSchema, EntityTypeSchema, PropertyTypeSchema

with workflow.unsafe.imports_passed_through():
    pass


@workflow.defn(name="getDataType")
class DataTypeWorkflow:
    """A workflow that reads a data type from the provided URL."""

    # TODO: Use Temporal's guide to convert between JSON and Pydantic objects.
    # https://github.com/temporalio/samples-python/tree/main/pydantic_converter
    @workflow.run
    async def get_data_type(self, versioned_url: str) -> str:
        """Calls the Graph API to get a data type schema."""
        data_type_schema = DataTypeSchema(
            **(
                await workflow.execute_child_workflow(
                    task_queue="ai",
                    workflow="getDataType",
                    arg={
                        "dataTypeId": versioned_url,
                    },
                )
            )["schema"],
        )
        print(  # noqa: T201
            data_type_schema.json(by_alias=True, exclude_none=True, indent=2),
        )
        return data_type_schema.json(by_alias=True, exclude_none=True)


@workflow.defn(name="getPropertyType")
class PropertyTypeWorkflow:
    """A workflow that reads a property type from the provided URL."""

    # TODO: Use Temporal's guide to convert between JSON and Pydantic objects.
    # https://github.com/temporalio/samples-python/tree/main/pydantic_converter
    @workflow.run
    async def get_property_type(self, versioned_url: str) -> str:
        """Calls the Graph API to get a property type schema."""
        property_type_schema = PropertyTypeSchema(
            **(
                await workflow.execute_child_workflow(
                    task_queue="ai",
                    workflow="getPropertyType",
                    arg={
                        "propertyTypeId": versioned_url,
                    },
                )
            )["schema"],
        )
        print(  # noqa: T201
            property_type_schema.json(by_alias=True, exclude_none=True, indent=2),
        )
        return property_type_schema.json(by_alias=True, exclude_none=True)


@workflow.defn(name="getEntityType")
class EntityTypeWorkflow:
    """A workflow that reads an entity type from the provided URL."""

    # TODO: Use Temporal's guide to convert between JSON and Pydantic objects.
    # https://github.com/temporalio/samples-python/tree/main/pydantic_converter
    @workflow.run
    async def get_entity_type(self, versioned_url: str) -> str:
        """Calls the Graph API to get an entity type schema."""
        entity_type_schema = EntityTypeSchema(
            **(
                await workflow.execute_child_workflow(
                    task_queue="ai",
                    workflow="getEntityType",
                    arg={
                        "entityTypeId": versioned_url,
                    },
                )
            )["schema"],
        )
        print(  # noqa: T201
            entity_type_schema.json(by_alias=True, exclude_none=True, indent=2),
        )
        return entity_type_schema.json(by_alias=True, exclude_none=True)
