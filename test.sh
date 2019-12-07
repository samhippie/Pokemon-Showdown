#!/bin/bash

node build
i=0
while true
do
    out="$(node .sim-dist/examples/trainer-example)"
    if grep -e '|win|' <<< "$out" >> /dev/null
    then
        let i++
        echo "$i"
    else
        echo "$out"
        break
    fi
done
