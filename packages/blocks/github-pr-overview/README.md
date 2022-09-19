# GitHub Pull Request Overview block

<!-- Link to be put here after publishing the block -->

## Entity Data

This block is capable of resolving and displaying pull request related data from the following GitHub API streams:

- [Pull Requests](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests) with an EntityType with the name `GithubPullRequest`
- [Reviews](https://docs.github.com/en/rest/pulls/reviews) with an EntityType with the name `GithubReview`
- [Issue Events](https://docs.github.com/en/developers/webhooks-and-events/events/issue-event-types) with an EntityType `GithubIssueEvent`

## Updating the Example Graph

It's possible to download new data for the example graph by querying the GitHub API manually.
An example of doing this using the GitHub CLI:

```sh
gh api \
  -H "Accept: application/vnd.github+json" \
  /repos/blockprotocol/blockprotocol/issues/ISSUE_NUMBER/events

gh api \
  -H "Accept: application/vnd.github+json" \
  /repos/blockprotocol/blockprotocol/pulls/PULL_NUMBER

gh api \
  -H "Accept: application/vnd.github+json" \
  /repos/blockprotocol/blockprotocol/pulls/PULL_NUMBER/reviews
```

The output then needs to be modified to fit the specification. This can be done through any number of ways, a short Python example is as follows:

```python
from pathlib import Path
import uuid
import json

def main():
    contents = json.loads(Path("issue_events.json").read_text())
    modified = []
    for entry in contents:
        modified.append({
            "entityId": str(uuid.uuid4()),
            "entityTypeId": "GithubIssueEventType",
            "properties": entry
        })

    Path("ssue_events_updated.json").write_text(json.dumps(modified))


if __name__ == "__main__":
    main()
```
