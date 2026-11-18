# iPhone 11 como kiosco de Claudio

Lee esto si vas a: montar o reconfigurar el iPhone del escritorio, o depurar por qué la pantalla se apaga, la PWA se cierra o no carga.

## 1. Acceso al servidor

- **En casa, sin HTTPS (vale para fase 0):** `http://192.168.0.215:3110` (prod) o `:3111` (dev). La IP es la del Mac mini en la Wi‑Fi; si cambia, mírala con `ipconfig getifaddr en0`. Conviene reservarla en el router.
- **Con HTTPS (necesario para micro/cámara, fase 3):** vía Tailscale, ver sección 4.

## 2. Instalar la PWA

1. Abre la URL en **Safari** (no Chrome: en iOS solo Safari instala PWAs con pantalla completa).
2. Compartir → **Añadir a pantalla de inicio** → nombre "Claudio".
3. Ábrela desde el icono: debe verse sin barras de Safari.

## 3. Modo kiosco

1. **Ajustes → Pantalla y brillo → Bloqueo automático → Nunca.** (La PWA también pide *wake lock*, pero esto es la red de seguridad.)
2. **Ajustes → Accesibilidad → Acceso Guiado → activar**, poner código y activar "Atajo de accesibilidad".
3. Abre Claudio y **pulsa tres veces el botón lateral** → Iniciar. Así no se sale de la app por accidente. Para salir: triple clic + código.
4. **Batería:** Ajustes → Batería → Salud y carga → **Carga optimizada / límite al 80 %** si aparece. Si no, un enchufe inteligente que corte la carga unas horas al día. Vigila que la batería no se hinche (pantalla que se levanta).
5. **Notificaciones:** activa *No molestar* permanente para que no tapen la cara.
6. Brillo: el modo noche (23:00–07:30) atenúa la página, pero el brillo de la pantalla lo pone iOS; bájalo a mano si molesta de noche.

## 4. HTTPS con Tailscale

1. Instala **Tailscale** en el Mac mini (App Store o tailscale.com) y en el iPhone (App Store); inicia sesión con la misma cuenta en ambos.
2. En el panel de Tailscale activa **MagicDNS** y **HTTPS Certificates** (DNS → HTTPS Certificates).
3. En el Mac mini:
   ```bash
   tailscale serve --bg --https=443 http://localhost:3110
   tailscale serve --bg --https=8443 http://localhost:3111
   ```
4. URL resultante: `https://<nombre-del-mac>.<tailnet>.ts.net` (prod) y `:8443` (dev). Solo accesible desde dispositivos de tu tailnet.
5. Vuelve a instalar la PWA desde la URL HTTPS (es otro origen: otro icono).

## Problemas conocidos

- **Punto de estado rojo:** el servidor no responde. Mira `~/Library/Logs/claudio-prod.log` y `launchctl print gui/$(id -u)/com.deimos97.claudio.prod`.
- **No se actualiza tras desplegar:** la PWA comprueba la versión cada 30 s; si no, cierra y abre la app.
