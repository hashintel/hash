from datetime import datetime

import devtools
from yarl import URL

from graph_sdk.client.blocking import HASHClient
from graph_sdk.filter import EntityPath
from graph_sdk.options import (
    Options,
    TemporalAxisBuilder,
    TemporalBound,
)
from graph_sdk.query import Parameter
from graph_sdk.utils import filter_latest_from_subgraph

COMPANY_URL = "https://blockprotocol.org/@examples/types/entity-type/company/"

client = HASHClient(URL("http://localhost:4000/"))

options = Options()
options.temporal_axes = TemporalAxisBuilder.pinned_transaction_time(None).between(
    start=TemporalBound.unbounded(),
    end=TemporalBound.exclusive(datetime.fromisoformat("2021-01-01T00:00:00+00:00")),
)

subgraph = client.query_entities(
    EntityPath().type_().base_url() == Parameter(COMPANY_URL),
    options,
)

buildings = filter_latest_from_subgraph(subgraph)

devtools.pprint(buildings)
