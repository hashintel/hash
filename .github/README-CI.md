# Continuous Integration and Continuous Delivery

This directory houses files related to our CI/CD and GitHub itself.

## `ISSUE_TEMPLATE`

Contains [GitHub issue templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository)

## `workflows`

Defines the workflows running on [GitHub Actions](https://docs.github.com/en/actions/quickstart)

## `actions`

Composite GitHub Actions definitions to be used in workflows

## `scripts`

Script files used in GitHub Actions workflows

## Freestanding files

### GitHub.com automations

- `pull_request_template.md` contains the template shown when opening a pull request
- `labeler.yml` contains definitions for automatic labelling of pull requests

### Third-party config files

- `codecov.yml` contains our Codecov configuration
- `renovate.json` contains our Mend Renovate configuration
