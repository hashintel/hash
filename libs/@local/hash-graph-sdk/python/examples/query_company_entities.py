import devtools
from yarl import URL

from graph_sdk.client.blocking import HASHClient
from graph_sdk.filter import EntityPath
from graph_sdk.options import Options
from graph_sdk.query import Parameter
from graph_sdk.utils import filter_latest_from_subgraph

COMPANY_URL = "https://blockprotocol.org/@examples/types/entity-type/company/"

client = HASHClient(URL("http://localhost:4000/"))

subgraph = client.query_entities(
    EntityPath().type_().base_url() == Parameter(COMPANY_URL),
    Options(),
)

buildings = filter_latest_from_subgraph(subgraph)

devtools.pprint(buildings)
