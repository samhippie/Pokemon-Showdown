#!/bin/sh

out="$(node build && node .sim-dist/examples/trainer-example | grep -e '|win|')"
while [ $? ]
do
    out="$(node .sim-dist/examples/trainer-example | grep -e '|win|')"
done
echo "${out}"
