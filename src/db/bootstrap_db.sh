#!/bin/sh
echo "Bootstrapping the DB"
sqlite3 ./src/db/brinet.db "VACUUM;"
sqlite3 ./src/db/brinet.db < ./src/db/schema.sqlite
echo "Finsihed bootstrapping the DB"
