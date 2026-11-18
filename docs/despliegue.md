# Despliegue a producción

Lee esto si vas a: desplegar, cambiar cómo se despliega o investigar por qué prod no tiene lo último.

## Cómo funciona (desde 2026-11-18)

1. Se trabaja en `dev`. Para producción, PR `dev → main`.
2. **Javier mergea el PR**: ese es el sí.
3. En menos de un minuto, el LaunchAgent `com.deimos97.claudio.autodeploy` lo detecta y despliega solo:
   - `~/.claudio/auto-deploy.sh` hace `git fetch` de `origin/main` en `~/Services/claudio-prod`.
   - Si hay commits nuevos, ejecuta una copia del `scripts/deploy.sh` de `main`: `git reset --hard`, `npm ci`, reinicia `com.deimos97.claudio.prod` y comprueba `/api/health`.
4. El iPhone y el resto de pantallas se recargan solas al ver la versión nueva (máx. 30 s).

Log: `~/Library/Logs/claudio-deploy.log` (solo escribe cuando despliega o falla).

Resultado del último despliegue: `~/.claudio/deploy-status.json` (`{ok, commit, at, output}` con el final de la salida). Lo leen dev y prod: si `ok` es `false`, el punto de conexión del pie se pone naranja, sale el aviso "⚠️ Falló el despliegue (commit)" y Claudio, al tocarlo, cuenta el final del error. Desaparece con el siguiente despliegue bueno.

## Comandos

```bash
scripts/deploy.sh                                   # desplegar a mano, ya
AUTO_DEPLOY_DRY_RUN=1 zsh ~/.claudio/auto-deploy.sh  # ¿desplegaría ahora?
scripts/install-autodeploy.sh                        # (re)instalar tras cambiar auto-deploy.sh
launchctl bootout gui/$(id -u)/com.deimos97.claudio.autodeploy   # pausar el automático
```

## Por qué así y no con GitHub Actions

El repo es público. Un runner de Actions en el Mac mini ejecutaría código de GitHub en la máquina de casa, y GitHub desaconseja runners propios en repos públicos (un PR de un fork podría lanzar trabajos en él). Un webhook necesitaría exponer otro punto de entrada. Preguntar a GitHub cada minuto no expone nada y solo despliega lo que ya está en `main`.

## Monkey noises

- **`auto-deploy.sh` se copia a `~/.claudio/`** al instalar: el LaunchAgent no depende de la rama de la copia de trabajo. Si se cambia, `scripts/install-autodeploy.sh` otra vez.
- **Se ejecuta una copia temporal de `deploy.sh`**, sacada de `origin/main`: el `git reset --hard` cambia el fichero mientras se está ejecutando. Por eso `deploy.sh` acepta `CLAUDIO_SCRIPTS_DIR`.
- **launchd no solapa ejecuciones**: si un despliegue tarda más de un minuto, la siguiente comprobación espera.
- **Sin red, no hace nada** y lo intenta al minuto siguiente.
- **Si `deploy.sh` falla** (p. ej. `/api/health` no responde), queda en el log con ✗. Prod puede haber quedado a medias: revisar el log de prod y, si hace falta, volver al commit anterior con `git -C ~/Services/claudio-prod reset --hard <commit>` y reiniciar el servicio.
