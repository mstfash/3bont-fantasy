#!/bin/sh
set -eu
if [ ! -s /run/secrets/pgbackrest_config ]; then
  echo 'The private pgBackRest configuration is required.' >&2
  exit 1
fi
install -d -o postgres -g postgres -m 0700 /etc/pgbackrest
install -o postgres -g postgres -m 0600 /run/secrets/pgbackrest_config /etc/pgbackrest/pgbackrest.conf
if [ "${1:-}" = pgbackrest ]; then
  exec gosu postgres "$@"
fi
exec /usr/local/bin/docker-entrypoint.sh "$@"
