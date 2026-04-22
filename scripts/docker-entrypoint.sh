#!/bin/sh
set -e

# Capture runtime UID/GID from environment variables, defaulting to 1000
PUID=${USER_UID:-1000}
PGID=${USER_GID:-1000}
PAPERCLIP_DATA_DIR=${PAPERCLIP_HOME:-/paperclip}

# Adjust the node user's UID/GID if they differ from the runtime request
# and fix volume ownership only when a remap is needed
changed=0

if [ "$(id -u node)" -ne "$PUID" ]; then
    echo "Updating node UID to $PUID"
    usermod -o -u "$PUID" node
    changed=1
fi

if [ "$(id -g node)" -ne "$PGID" ]; then
    echo "Updating node GID to $PGID"
    groupmod -o -g "$PGID" node
    usermod -g "$PGID" node
    changed=1
fi

mkdir -p "$PAPERCLIP_DATA_DIR"

if [ "$changed" = "1" ] || ! gosu node test -w "$PAPERCLIP_DATA_DIR"; then
    echo "Ensuring node owns $PAPERCLIP_DATA_DIR"
    chown -R node:node "$PAPERCLIP_DATA_DIR"
fi

exec gosu node "$@"
