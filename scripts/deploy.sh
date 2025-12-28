#!/bin/bash
set -e

DOKKU_HOST="${DOKKU_HOST:-dokku@your-server.com}"
APP_NAME="bud"

echo "[deploy] Pushing to Dokku..."
git push dokku main

echo "[deploy] Done! Check logs with: ssh $DOKKU_HOST logs $APP_NAME -t"
