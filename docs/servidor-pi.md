# Acceso por dominio: Raspberry (nginx + Pi-hole) → Mac mini

Lee esto si vas a: cambiar cómo se llega a Claudio desde fuera o desde el iPhone, tocar certificados, DNS o el nginx de la Raspberry.

## Cómo está montado (2026-11-18)

```
Internet ── router (188.87.78.113, DDNS) ──► Raspberry 192.168.0.5 (nginx :80/:443, Pi-hole DNS+DHCP)
                                                    │ proxy_pass
iPhone / Mac en casa ── Pi-hole resuelve ───────────┘──► Mac mini 192.168.0.215 :3110 (prod) / :3111 (dev)
claudio*.hotwheelsandbids.com → 192.168.0.5
```

- **Dominios:** `claudio.hotwheelsandbids.com` (prod) y `claudio-dev.hotwheelsandbids.com` (dev).
- **DNS público:** Cloudflare (NS `meg`/`nitin.ns.cloudflare.com`), registros en modo *DNS only* (nube gris). El apex lo actualiza el DDNS; los subdominios son CNAME al apex para seguirlo solos.
- **DNS local:** Pi-hole (`/etc/pihole/pihole.toml`, `dns.hosts`) responde la IP local de la Raspberry para que desde casa no se pase por la IP pública.
- **nginx:** `deploy/nginx/claudio.conf` de este repo, copiado a `/etc/nginx/sites-available/claudio` y enlazado en `sites-enabled`. Certificados con certbot (plugin nginx, reto HTTP-01 por el puerto 80).
- **Acceso:** desde `192.168.0.0/24` sin login (el kiosco); desde fuera, sesión del **home-portal** (`hotwheelsandbids.com/login`) vía `auth_request`, igual que `pihole.`.
- **El servidor de la Raspberry pertenece al proyecto `home-portal`** (sitio `public_html`). No tocar ese fichero desde aquí.

## Instalación (una vez; requiere a Javier: Cloudflare, Pi-hole y `sudo` en la Raspberry)

1. **Cloudflare → DNS → Add record** (dos veces):
   - `CNAME` · nombre `claudio` · destino `hotwheelsandbids.com` · *DNS only*
   - `CNAME` · nombre `claudio-dev` · destino `hotwheelsandbids.com` · *DNS only*
2. **Pi-hole (web) → Settings → Local DNS Records**: añadir
   - `claudio.hotwheelsandbids.com` → `192.168.0.5`
   - `claudio-dev.hotwheelsandbids.com` → `192.168.0.5`
3. **Pi-hole → Settings → DHCP → Static leases**: fijar el Mac mini (Ethernet `en0`, MAC `20:a5:cb:d1:b8:b7`) en `192.168.0.215`. Si su IP cambiara, nginx dejaría de encontrarlo.
4. **Router:** comprobar que los puertos 80 y 443 están redirigidos a `192.168.0.5` (443 ya funciona; el 80 hace falta para emitir y renovar certificados).
5. **En la Raspberry** (desde el Mac: `ssh deimos97@192.168.0.5`):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/deimos97/claudio-task-assistant/main/deploy/nginx/claudio.conf -o /tmp/claudio.conf
   sudo cp /tmp/claudio.conf /etc/nginx/sites-available/claudio
   sudo ln -s /etc/nginx/sites-available/claudio /etc/nginx/sites-enabled/claudio
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d claudio.hotwheelsandbids.com -d claudio-dev.hotwheelsandbids.com --redirect
   ```
   (Si el fichero aún no está en `main`, cópialo con `scp deploy/nginx/claudio.conf deimos97@192.168.0.5:/tmp/`.)
6. Comprobar: `https://claudio.hotwheelsandbids.com` en casa abre sin login; con datos móviles pide el login del portal.

## Cambios posteriores

- El fichero de la Raspberry lo modifica certbot (añade SSL). Para cambiar algo, edita `deploy/nginx/claudio.conf` aquí **y** aplica el mismo cambio a mano en `/etc/nginx/sites-available/claudio`, conservando las líneas `# managed by Certbot`. Siempre `sudo nginx -t` antes de `reload`.

## Monkey noises

- **`security.inc` del portal no se incluye en Claudio a propósito:** bloquea métodos que no sean GET/HEAD/POST y el user-agent `curl`, y la API de Claudio puede necesitar otros.
- **Reglas de acceso dentro de `location /`:** si se ponen a nivel de `server`, el reto de certbot (`/.well-known/acme-challenge/`) recibe 401 y la emisión falla.
- **Sesión del portal = 12 h** (`lifetime` de la cookie en `auth-check.php`): desde fuera hay que volver a entrar cada 12 h. En casa no afecta porque la red local no pide login.
- **iCloud Private Relay / "Limitar rastreo de IP"** en el iPhone pueden saltarse el Pi-hole y resolver la IP pública: desactivarlos para la Wi‑Fi de casa.
- **Sin `sudo` sin contraseña en la Raspberry:** los cambios de nginx/certbot los ejecuta Javier.
