#!/usr/bin/env bash

REPOSITORY_ROOT="$(git rev-parse --show-toplevel)"

function convert_nanos() {
  if [[ $1 -lt 1000 ]]; then
    echo "$1 \mathrm{ ns}"
  elif [[ $1 -lt 1000000 ]]; then
    echo "$(bc <<< "scale=2; $1 / 1000") \mathrm{ µs}"
  elif [[ $1 -lt 1000000000 ]]; then
    echo "$(bc <<< "scale=2; $1 / 1000000") \mathrm{ ms}"
  else
    echo "$(bc <<< "scale=2; $1 / 1000000000") \mathrm{ s}"
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
        percent=$(jq -r '.mean.point_estimate' "$2/estimates.json" | awk '{printf "%+.2f", 100*$0}')

        echo -n '\space({\color{'
        if [[ ${percent%.*} -lt 5 && ${percent%.*} -gt -5 ]]; then
            echo -n "gray"
        elif [[ ${percent%.*} -lt 0 ]]; then
            echo -n "lightgreen"
        else
            echo -n "red"
        fi
        echo -n "}$percent"
        echo -n '\\%})'
    fi
    echo '$$ |'
}

for group in "$REPOSITORY_ROOT/target/criterion/"*; do
    if [[ -d "$group" ]]; then
        group_used=false

        if [[ -d "$group/new" ]]; then
            if [[ -d "$group/change" ]]; then
                compare "$group/new" "$group/change"
            else
                compare "$group/new"
            fi
            group_used=true
        fi

        for func in "$group"/*; do
            if [[ -d "$func" ]]; then

                if [[ -d "$func/new" ]]; then
                    if [[ -d "$func/change" ]]; then
                        compare "$func/new" "$func/change"
                    else
                        compare "$func/new"
                    fi
                    group_used=true
                fi

                for value in "$func"/*; do
                    if [[ -d "$value" ]]; then
                        if [[ -d "$value/new" ]]; then
                            if [[ -d "$value/change" ]]; then
                                compare "$value/new" "$value/change"
                            else
                                compare "$value/new"
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
