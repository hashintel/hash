#!/usr/bin/env bash

REPOSITORY_ROOT="$(git rev-parse --show-toplevel)"

BASE=base
NEW=new

while [[ $# -gt 0 ]]; do
    case "$1" in
        -b|--base)
            BASE=$2
            shift 2
            ;;
        -n|--new)
            NEW=$2
            shift 2
            ;;
        *)
            # shellcheck disable=SC2016
            echo 'Unknown option: `$1`'
            echo "usage: $0 [-b|--base <base>] [-n|--new <new>]"
            exit 1
            ;;
    esac
done

function convert_nanos() {
  if [[ $1 -lt 1000 ]]; then
    echo "$1 \text{ ns}"
  elif [[ $1 -lt 1000000 ]]; then
    echo "$(bc <<< "scale=2; $1 / 1000") \text{ µs}"
  elif [[ $1 -lt 1000000000 ]]; then
    echo "$(bc <<< "scale=2; $1 / 1000000") \text{ ms}"
  else
    echo "$(bc <<< "scale=2; $1 / 1000000000") \text{ s}"
  fi
}

last_group_id=""

# Usage: compare <new> [old]
function compare() {
    group_id=$(jq -r '.group_id' "$1/benchmark.json")
    if [[ $group_id != "$last_group_id" ]]; then
        last_group_id=$group_id
        echo "### $group_id"
        echo
        echo "| Function | Value | Mean |"
        echo "|----------|-------|------|"
    fi

    function_id=$(jq -r '.function_id' "$1/benchmark.json")
    value_str=$(jq -r '.value_str' "$1/benchmark.json")

    new_mean=$(jq -r '.mean.point_estimate' "$1/estimates.json")
    new_stderr=$(jq -r '.mean.standard_error' "$1/estimates.json")
    new_mean=${new_mean%.*}
    new_stderr=${new_stderr%.*}

    echo -n "| $function_id | $value_str | \$\$$(convert_nanos $new_mean) \pm $(convert_nanos $new_stderr)"
    if [[ -n $2 ]]; then
        old_mean=$(jq -r '.mean.point_estimate' "$2/estimates.json")
        old_stderr=$(jq -r '.mean.standard_error' "$2/estimates.json")
        old_mean=${old_mean%.*}
        old_stderr=${old_stderr%.*}

        percent=$(bc <<< "scale=2; 100 * ($new_mean - $old_mean) / $old_mean")
        if [[ $percent -ge 0 ]]; then
            percent="+$percent"
        fi

#        $${\color{white}White}$$
        echo -n '\space({\color{'
        if [[ $percent -lt 5 && $percent -gt -5 ]]; then
            echo -n "lightgreen"
        elif [[ $is_regression -eq 1 ]]; then
            echo -n "red"
        else
            echo -n "gray"
        fi
        echo -n "}$percent"
        echo -n '\\%})'
    fi
    echo '$$ |'
}

for group in "$REPOSITORY_ROOT/target/criterion/"*; do
    if [[ -d "$group" ]]; then
        group_used=false
        for func in "$group"/*; do
            if [[ -d "$func" ]]; then
                for value in "$func"/*; do
                    if [[ -d "$value" ]]; then
                        if [[ -d "$value/$NEW" ]]; then
                            if [[ -d "$value/$BASE" ]]; then
                                compare "$value/$NEW" "$value/$BASE"
                            else
                                compare "$value/$NEW"
                            fi
                            group_used=true
                        fi
                    fi
                done
            fi
        done
        if [[ $group_used == true ]]; then
            echo
        fi
    fi
done
