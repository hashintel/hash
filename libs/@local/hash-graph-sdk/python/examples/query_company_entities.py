from uuid import UUID

import devtools
from yarl import URL

from graph_sdk.client.blocking import HASHClient
from graph_sdk.filter import EntityQueryPath
from graph_sdk.options import Options
from graph_sdk.query import Parameter
from graph_sdk.utils import filter_latest_from_subgraph

COMPANY_URL = "https://blockprotocol.org/@examples/types/entity-type/company/"
ACTOR_ID = UUID(int=0)  # replace with your actor ID

client = HASHClient(URL("http://localhost:4000/"), actor=ACTOR_ID)

subgraph = client.query_entities(
    EntityQueryPath().type_().base_url() == Parameter(COMPANY_URL),
    Options(),
)

buildings = filter_latest_from_subgraph(subgraph)

devtools.pprint(buildings)
