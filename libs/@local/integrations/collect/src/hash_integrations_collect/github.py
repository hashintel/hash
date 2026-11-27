"""The issues and pull requests of a GitHub repository, as a dlt source."""

from datetime import UTC, datetime, timedelta

import dlt
from dlt.common.typing import TSecretStrValue
from dlt.extract import DltResource
from dlt.sources.rest_api import rest_api_resources
from dlt.sources.rest_api.typing import ClientConfig

API = "https://api.github.com"

# A column that is null in every row of a collection is not created, so a later value would change
# the table's schema, across which the change data feed cannot be read. Every column is declared.
_ISSUE_COLUMNS = {
    "number": {"data_type": "bigint", "nullable": False},
    "title": {"data_type": "text"},
    "state": {"data_type": "text"},
    "url": {"data_type": "text"},
    "author": {"data_type": "text"},
    "created_at": {"data_type": "timestamp"},
    "updated_at": {"data_type": "timestamp"},
    "closed_at": {"data_type": "timestamp"},
}
_PULL_REQUEST_COLUMNS = {
    **_ISSUE_COLUMNS,
    "draft": {"data_type": "bool"},
    "merged_at": {"data_type": "timestamp"},
}


def _issue(item: dict[str, object]) -> dict[str, object]:
    user = item.get("user")
    return {
        "number": item["number"],
        "title": item["title"],
        "state": item["state"],
        "url": item["html_url"],
        "author": user.get("login") if isinstance(user, dict) else None,
        "created_at": item["created_at"],
        "updated_at": item["updated_at"],
        "closed_at": item.get("closed_at"),
    }


def _pull_request(item: dict[str, object]) -> dict[str, object]:
    return {
        **_issue(item),
        "draft": item.get("draft"),
        "merged_at": item.get("merged_at"),
    }


@dlt.source(name="github")
def github_source(
    *,
    owner: str = dlt.config.value,
    repo: str = dlt.config.value,
    initial_days: int = 7,
    access_token: TSecretStrValue | None = None,
    api: str = API,
) -> list[DltResource]:
    """Return the issues and pull requests of `owner/repo`, by number.

    dlt resolves the arguments from its configuration, in the section `sources.github`: from
    environment variables such as `SOURCES__GITHUB__OWNER`, then `.dlt/secrets.toml` and
    `.dlt/config.toml`. `access_token` is a secret; without it, the API allows 60 requests an hour.

    The first collection reads what was updated in the last `initial_days` days. Each later one
    reads only what was updated after the last: issues through the API's `since` parameter, and pull
    requests newest first, until one is older than the cursor.
    """
    cursor = (datetime.now(UTC) - timedelta(days=initial_days)).isoformat().replace("+00:00", "Z")
    client: ClientConfig = {
        "base_url": f"{api}/repos/{owner}/{repo}/",
        "headers": {"Accept": "application/vnd.github+json"},
        "paginator": "header_link",
    }
    if access_token:
        client["auth"] = {"type": "bearer", "token": access_token}
    return rest_api_resources({
        "client": client,
        "resource_defaults": {
            "primary_key": "number",
            "endpoint": {"params": {"per_page": 100}},
        },
        "resources": [
            {
                "name": "issues",
                "columns": _ISSUE_COLUMNS,
                "endpoint": {
                    "path": "issues",
                    "params": {
                        "state": "all",
                        "sort": "updated",
                        "direction": "asc",
                        "since": {
                            "type": "incremental",
                            "cursor_path": "updated_at",
                            "initial_value": cursor,
                        },
                    },
                },
                # The issues endpoint also lists pull requests.
                "processing_steps": [
                    {"filter": lambda item: "pull_request" not in item},
                    {"map": _issue},
                ],
            },
            {
                "name": "pull_requests",
                "columns": _PULL_REQUEST_COLUMNS,
                "endpoint": {
                    "path": "pulls",
                    "params": {"state": "all", "sort": "updated", "direction": "desc"},
                    "incremental": {
                        "cursor_path": "updated_at",
                        "initial_value": cursor,
                        "row_order": "desc",
                    },
                },
                "processing_steps": [{"map": _pull_request}],
            },
        ],
    })
