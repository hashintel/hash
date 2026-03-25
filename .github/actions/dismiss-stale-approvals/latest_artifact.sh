#!/usr/bin/env bash
set -euo pipefail

repository=$1
pr_number=$2
branch_name=$3
workflow_name=$4
artifact_name=$5

echoerr() { echo "$@" 1>&2; }

gh_api_collect() {
  local endpoint="$1"
  local array_key="$2"
  gh api --paginate "/${endpoint}" | jq ".${array_key}"
}

workflows="$(gh_api_collect "repos/${repository}/actions/workflows" "workflows")"
latest_workflow_id="$(jq \
  --arg workflow_name "$workflow_name" \
  '[.[] | select(.name==$workflow_name)] | (if length>0 then (max_by(.updated_at).id) else null end)' <<< "${workflows}" || echo "ERROR")"

if [[ "${latest_workflow_id}" == "ERROR" ]]; then
  echoerr "Failed to parse workflows with jq"
  echoerr "${workflows}"
  exit 0
fi

if [[ -z "${latest_workflow_id}" || "${latest_workflow_id}" == "null" ]]; then
  echoerr "No workflow found with name ${workflow_name}"
  exit 0
fi
echoerr "Latest workflow ID: ${latest_workflow_id}"

runs="$(gh_api_collect "repos/${repository}/actions/workflows/${latest_workflow_id}/runs?status=success&branch=${branch_name}" "workflow_runs")"
latest_workflow_run_id="$(jq \
  --argjson pr_number "${pr_number}" \
  '([.[] | select(.pull_requests | any(.number == $pr_number))] | max_by(.run_number)) | .id' <<< "${runs}" || echo "ERROR")"

if [[ "${latest_workflow_run_id}" == "ERROR" ]]; then
  echoerr "Failed to parse workflow runs with jq"
  echoerr "${runs}"
  exit 0
fi

if [[ -z "${latest_workflow_run_id}" || "${latest_workflow_run_id}" == "null" ]]; then
  echoerr "No successful workflow run found for PR ${pr_number} on branch ${branch_name}"
  exit 0
fi
echoerr "Latest workflow run ID: ${latest_workflow_run_id}"

artifacts="$(gh_api_collect "repos/${repository}/actions/runs/${latest_workflow_run_id}/artifacts" "artifacts")"
latest_artifact_id="$(jq \
  --arg artifact_name "$artifact_name" \
  '[.[] | select(.name==$artifact_name)] | (if length>0 then (.[0].id) else null end)' <<< "${artifacts}" || echo "ERROR")"

if [[ "${latest_artifact_id}" == "ERROR" ]]; then
  echoerr "Failed to parse artifacts with jq"
  echoerr "${artifacts}"
  exit 0
fi

if [[ -z "${latest_artifact_id}" || "${latest_artifact_id}" == "null" ]]; then
  echoerr "No artifacts found for workflow run ${latest_workflow_run_id}"
  exit 0
fi
echoerr "Latest artifact ID: ${latest_artifact_id}"

gh api "/repos/${repository}/actions/artifacts/${latest_artifact_id}/zip" > "${artifact_name}.zip"
unzip -q "${artifact_name}.zip"
