#!/bin/sh
sqlite3 brinet.db "VACUUM;"
sqlite3 brinet.db < schema.sqlite
