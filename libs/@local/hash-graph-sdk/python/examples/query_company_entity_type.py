from uuid import UUID

from graph_types import EntityTypeReference
from yarl import URL

from graph_sdk import TypeAPI
from graph_sdk.utils import async_to_sync, print_schema

graph = TypeAPI(URL("http://localhost:4000/"))

reference = EntityTypeReference(
    **{"$ref": "https://blockprotocol.org/@examples/types/entity-type/company/v/1"},
)

entity_type = async_to_sync(
    reference.create_model(
        actor_id=UUID(int=0),  # replace with your actor ID
        graph=graph,
        additional_properties=False,
    ),
)

print_schema(
    entity_type,
    {
        "https://blockprotocol.org/@examples/types/property-type/e-mail/": None,
        "https://blockprotocol.org/@blockprotocol/types/property-type/name/": (
            "Hello World"
        ),
    },
)
