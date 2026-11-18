# iPhone 11 como kiosco de Claudio

Lee esto si vas a: montar o reconfigurar el iPhone del escritorio, o depurar por qué la pantalla se apaga, la PWA se cierra o no carga.

## 1. Acceso al servidor

- **Normal (HTTPS):** `https://claudio.hotwheelsandbids.com` (prod) y `https://claudio-dev.hotwheelsandbids.com` (dev). En casa entra sin login; fuera pide el login del home-portal. Montaje en `docs/servidor-pi.md`.
- **De emergencia, sin HTTPS:** `http://192.168.0.215:3110` (prod) o `:3111` (dev), directo al Mac mini. Sin micro ni cámara.

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

## 4. iCloud Private Relay

En el iPhone: Ajustes → Wi‑Fi → (i) de la red de casa → desactivar **Limitar rastreo de dirección IP**, y en Ajustes → [tu nombre] → iCloud → **Relay privado** desactivado (o al menos para esta red). Si no, Safari puede saltarse el Pi-hole y no encontrar Claudio en casa.

## Problemas conocidos

- **Punto de estado rojo:** el servidor no responde (o, fuera de casa, la sesión del portal caducó: vuelve a entrar). Mira `~/Library/Logs/claudio-prod.log` y `launchctl print gui/$(id -u)/com.deimos97.claudio.prod`.
- **No se actualiza tras desplegar:** la PWA comprueba la versión cada 30 s; si no, cierra y abre la app.
