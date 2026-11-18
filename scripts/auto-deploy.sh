#!/bin/zsh
# Despliegue automático: si origin/main tiene commits que prod no tiene, ejecuta deploy.sh.
# Lo lanza cada minuto el LaunchAgent com.deimos97.claudio.autodeploy (scripts/install-autodeploy.sh).
# Es "pull": el Mac mini pregunta a GitHub; no hay nada expuesto ni runner de Actions.
#   AUTO_DEPLOY_DRY_RUN=1 → solo dice si desplegaría.
set -uo pipefail

PROD_DIR="${CLAUDIO_PROD_DIR:-$HOME/Services/claudio-prod}"
stamp() { date '+%Y-%m-%d %H:%M:%S'; }

cd "$PROD_DIR" 2>/dev/null || { echo "$(stamp) no existe $PROD_DIR"; exit 1; }
git fetch --quiet origin main 2>/dev/null || exit 0   # sin red: ya se intentará en el siguiente minuto

current="$(git rev-parse --short HEAD)"
target="$(git rev-parse --short origin/main)"
[[ "$current" == "$target" ]] && exit 0

if [[ -n "${AUTO_DEPLOY_DRY_RUN:-}" ]]; then
  echo "$(stamp) desplegaría $current → $target"
  exit 0
fi

echo "$(stamp) main ha cambiado: $current → $target"
# Se ejecuta una copia de deploy.sh de main: el original cambia bajo sus pies con el git reset.
tmp="$(mktemp -t claudio-deploy)"
git show origin/main:scripts/deploy.sh > "$tmp"
chmod +x "$tmp"
# deploy.sh busca install-agent.sh junto a sí mismo: se le pasa la carpeta de scripts de prod.
if CLAUDIO_SCRIPTS_DIR="$PROD_DIR/scripts" "$tmp"; then
  echo "$(stamp) ✓ desplegado $target"
else
  echo "$(stamp) ✗ falló el despliegue de $target (prod puede haber quedado a medias: revisar)"
fi
rm -f "$tmp"
