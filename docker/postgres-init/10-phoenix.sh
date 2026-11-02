#!/bin/bash
# Runs once, when the pgdata volume is first initialised.
set -e

psql -v ON_ERROR_STOP=1 -v pw="$PHOENIX_DB_PASSWORD" -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
CREATE ROLE phoenix LOGIN PASSWORD :'pw';
CREATE DATABASE phoenix OWNER phoenix;
SQL
