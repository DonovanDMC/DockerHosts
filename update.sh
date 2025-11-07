#!/bin/sh

CONTAINER_NAME="docker-hosts"

pid=$(docker inspect -f '{{.State.Pid}}' $CONTAINER_NAME)
if [ -z "$pid" ] || [ "$pid" = "0" ]; then
  echo "Container $CONTAINER_NAME is not running."
  exit 1
fi

kill -USR1 $pid
