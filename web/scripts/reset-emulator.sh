#!/usr/bin/env bash
# Borra todos los datos del emulador (Firestore + Auth) con reintentos y vuelve a cargar los datos de ejemplo.
set -u
FS='http://127.0.0.1:8080/emulator/v1/projects/demo-bodega/databases/(default)/documents'
AU='http://127.0.0.1:9099/emulator/v1/projects/demo-bodega/accounts'
for i in 1 2 3 4 5 6; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$FS")
  [ "$code" = "200" ] && break
  sleep 2
done
[ "$code" = "200" ] || { echo "No se pudo borrar Firestore (HTTP $code)"; exit 1; }
curl -s -o /dev/null -X DELETE "$AU"
npm run seed:emulator -- --demo
# como el "Reiniciar datos" de producción: cambia la época para que las pestañas abiertas descarten su copia local y recarguen
curl -s -o /dev/null -X PATCH -H 'Authorization: Bearer owner' -H 'Content-Type: application/json' \
  "$FS/meta/app?updateMask.fieldPaths=epoch" -d "{\"fields\":{\"epoch\":{\"integerValue\":\"$(date +%s%3N)\"}}}"
