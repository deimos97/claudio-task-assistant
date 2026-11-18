# Voz: oídos, wake word y voz de Claudio

Lee esto si vas a: tocar el micro, la detección de "Claudio", el reconocimiento (whisper) o la voz con la que habla.

## Cómo funciona

```
micro del iPhone ─► web/voice.js: remuestreo a 16 kHz + VAD por energía ─► frase (WAV)
   ─► POST /api/stt ─► whisper-server (127.0.0.1:3120) ─► texto
   ─► ¿empieza por "Claudio"? ─ no → se descarta
                              ─ "Claudio" solo → pitido, ojos escuchando, 7 s para la orden
                              ─ "Claudio, haz X" → X va directo al chat
   ─► respuesta en streaming (POST /api/chat con Accept: application/x-ndjson)
   ─► cada frase, en cuanto se cierra (". ", "? "…) ─► POST /api/tts {text, context}
      ─► español: `say` Jorge (AAC) · inglés: Kokoro Heart (WAV) ─► altavoz, en orden y sin hueco
      (sordo desde la primera frase hasta 350 ms después de la última)
   ─► si la respuesta acaba en "?", pitido y escucha la contestación sin wake word
```

- **Activar:** botón de micro en la cabecera. Se recuerda por dispositivo (`localStorage` `claudio.voice`). Solo responde en voz alta el dispositivo donde se preguntó por voz; lo escrito no se dice en alto.
- **Con la voz activada, tocar la cara** = "te escucho" (pitido) sin decir "Claudio".
- **Pitidos:** sube (660→990 Hz) = te escucho; baja (660→440 Hz) = me cansé de esperar.

## Piezas en el Mac mini

| Pieza | Dónde |
|---|---|
| whisper.cpp (`brew install whisper-cpp`) | `whisper-server`, LaunchAgent `com.deimos97.claudio.whisper`, log `~/Library/Logs/claudio-whisper.log` |
| Modelos | `~/.claudio/models/ggml-large-v3-turbo-q5_0.bin` (548 MB) y `ggml-silero-v5.1.2.bin` (VAD) |
| Instalar / reinstalar | `scripts/install-whisper.sh` (descarga lo que falte) |
| Voz en español | `say -v "Jorge (Enhanced)"` (descargada en Ajustes → Accesibilidad → Contenido leído → Gestionar voces). Cambiar con `CLAUDIO_VOICE_ES` |
| Voz en inglés | Kokoro `af_heart`: `scripts/kokoro-server.py` como LaunchAgent `com.deimos97.claudio.kokoro` en 127.0.0.1:3121, venv `~/.claudio/tts-venv`, modelos `~/.claudio/models/tts/`, log `~/Library/Logs/claudio-kokoro.log`. Instalar/reinstalar: `scripts/install-tts.sh`. Cambiar con `CLAUDIO_VOICE_EN`. Si no responde, `say` Samantha (`CLAUDIO_VOICE_EN_FALLBACK`) |

Dev y prod usan el mismo whisper. Ajustes en `server/voice.ts`; los del VAD del navegador, arriba de `web/voice.js`.

## Voces disponibles (2026-11-18)

Muestras en `web/_voces/` (fuera de git; en dev: `/_voces/`). Todas locales y gratis:

| Motor | Voces probadas | Tiempo por frase (~6 s de audio) | Instalación |
|---|---|---|---|
| macOS `say` | Jorge y Mónica (mejoradas), Reed, Paulina, Eddy, Rocko; Samantha, Daniel | instantáneo | ya está |
| Piper (neuronal) | es: davefx, sharvard, carlfm; en: ryan | 0,1–0,4 s | `~/.claudio/tts-venv` (Python 3.12) + `~/.claudio/models/tts/*.onnx` |
| Kokoro-82M (neuronal) | es: alex, santa, dora; en: michael, puck, heart, george | 1,3–2 s | mismo venv + `kokoro-v1.0.onnx` (325 MB) |

Elegidas el 2026-11-18 (provisionales): **Jorge (mejorada)** en español y **Kokoro Heart** en inglés. Ninguna local tenía acento de España y carácter a la vez; queda pendiente buscar una voz de personaje ("robot Disney") en castellano. Opciones de pago si ninguna convence: ElevenLabs, OpenAI TTS, Google Chirp HD, Azure Neural.

## Medidas (M2 Pro, 2026-11-18)

Respuesta por frases (2026-11-18, "¿Qué tiempo hará mañana?" en dos frases): primera frase escrita a 0,72 s y sonando a **1,65 s** de mandar la pregunta, frente a 1,87 s antes (respuesta entera 0,96 s + audio de todo 0,9 s). Con respuestas largas se gana más. Fin de frase del VAD: de 700 a **500 ms** (`END_MS` en `web/voice.js`; subirlo si corta a media frase). En total, ~0,4 s menos.

Lo que queda: whisper ~0,85 s y `say` ~0,7 s por frase, casi todo arrancar el proceso y cargar la voz (en WAV tarda lo mismo que en AAC). Un proceso de voz que se quede abierto, o Piper (0,1–0,4 s), lo bajaría.

- whisper con idioma fijo `es`: **~0,85 s** por frase de 2–3 s; con `auto`, ~1,7 s. Con `es` transcribe bien el inglés, así que se deja fijo.
- De fin de frase a empezar a hablar: ~3,3 s en español (whisper 0,9 + Haiku 1,8 + Jorge 0,6–0,8) y ~4 s en inglés (Kokoro ~1,3 s).

## Monkey noises

- **`kokoro-server.py` se copia a `~/.claudio/`** al instalar: el LaunchAgent no depende de la rama que haya en la copia de trabajo. Tras cambiarlo, volver a ejecutar `scripts/install-tts.sh`.
- **La primera llamada a Kokoro tras arrancar es más lenta** (carga del modelo, ~325 MB).

- **Safari no reproduce audio que pasa por el service worker** (pide trozos con `Range`): `web/sw.js` deja pasar directos el audio, el vídeo y todo lo que esté bajo `/_`.

- **Frases para la voz:** las de menos de 12 caracteres ("Vale.") se juntan con la siguiente para que no suene a trompicones. El idioma se decide con todo lo dicho hasta esa frase (`context`), no con la frase sola: "Sure." sola parecería español.
- **La wake word no es un modelo dedicado:** se transcribe cada frase que supera el ruido de fondo y se mira si empieza por "Claudio". Con tele o conversación, whisper trabaja en continuo (local, sin coste). Si hay falsos positivos o carga, cambiar por openWakeWord/Porcupine solo esa pieza.
- **iOS necesita un toque para el audio:** tras una recarga (cada despliegue), si `AudioContext` no arranca solo, Claudio dice "Toca la pantalla para despertar mis oídos" y el primer toque lo activa. La auto-recarga no ocurre mientras está escuchando una orden o hablando.
- **Permiso del micro en la PWA:** iOS puede volver a pedirlo al abrir la app desde la pantalla de inicio.
- **Volumen con el micro abierto:** iOS puede bajar el volumen o cambiar el altavoz mientras captura. Pendiente de comprobar en el iPhone real.
- **El remuestreo arrastra la fase entre bloques**: si `pos` queda en [-1, 0) se interpola con la última muestra del bloque anterior. Sin eso salía `NaN` y el VAD no detectaba nada.
- **Probar sin micro:** en la consola, sustituir `navigator.mediaDevices.getUserMedia` por un `MediaStreamDestination` que reproduzca un WAV generado con `say -o x.wav --file-format=WAVE --data-format=LEI16@16000 "[[slnc 1500]] Claudio. [[slnc 2500]] ¿Qué tengo?"`, y activar el micro.

## Quién habla (Javier o Ana)

- El navegador calcula el **tono medio** de cada frase (`pitchOf` en `web/voice.js`: autocorrelación normalizada en ventanas de 32 ms, mediana de las ventanas con voz).
- Por debajo de 140 Hz → Javier; por encima de 160 → Ana; entre medias, el dueño del dispositivo (o nadie). Corte ajustable por dispositivo: `localStorage.setItem('claudio.pitchSplit', 160)`.
- Medido con las voces del Mac: Jorge 120 Hz, Mónica 174 Hz. **Falta calibrar con las voces reales**: la pulsación larga sobre la cara enseña el tono de la última frase.
- Dueño del dispositivo: menú del pie → "Este dispositivo" (Kiosco / Javier / Ana; se guarda en `localStorage` `claudio.who`). El kiosco debe quedarse en Kiosco: es el único que escucha «Claudio» todo el rato; en un móvil personal el micro es pulsar para hablar.
- La respuesta se dice con la voz de quien habla: Jorge a Javier (y si no se sabe), **Mónica (mejorada)** a Ana (`PEOPLE` en `server/config.ts`; `CLAUDIO_VOICE_ES_ANA` para cambiarla). En inglés, Kokoro Heart para los dos.
- Decir "Claudio" otra vez tras el pitido no se manda como orden: se sigue escuchando.
- Si el tono falla mucho (resfriados, voces parecidas), el siguiente paso es una huella de voz local (modelo de embeddings + unas frases grabadas de cada uno).
