"""Servidor mínimo de Kokoro (voz neuronal local) para Claudio.

Escucha en 127.0.0.1:3121 y mantiene el modelo cargado.
  POST /tts  {"text": "...", "voice": "af_heart", "lang": "en-us", "speed": 1.0}  → audio/wav (16 bits)
  GET  /health → {"ok": true}
Lo instala y arranca scripts/install-tts.sh (LaunchAgent com.deimos97.claudio.kokoro).
"""
import io
import json
import os
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

import numpy as np
from kokoro_onnx import Kokoro

MODELS = os.path.expanduser(os.environ.get('CLAUDIO_TTS_MODELS', '~/.claudio/models/tts'))
PORT = int(os.environ.get('CLAUDIO_KOKORO_PORT', '3121'))

kokoro = Kokoro(f'{MODELS}/kokoro-v1.0.onnx', f'{MODELS}/voices-v1.0.bin')
VOICES = set(kokoro.get_voices())
lock = Lock()  # una síntesis a la vez


def to_wav(samples: np.ndarray, rate: int) -> bytes:
    pcm = (np.clip(samples, -1, 1) * 32767).astype('<i2')
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _error(self, code: int, msg: str) -> None:
        self._send(code, json.dumps({'error': msg}).encode(), 'application/json')

    def do_GET(self) -> None:
        if self.path == '/health':
            self._send(200, b'{"ok":true}', 'application/json')
        else:
            self._error(404, 'no existe')

    def do_POST(self) -> None:
        if self.path != '/tts':
            return self._error(404, 'no existe')
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length > 20_000:
                return self._error(413, 'texto demasiado largo')
            req = json.loads(self.rfile.read(length) or b'{}')
            text = str(req.get('text', '')).strip()[:1500]
            voice = str(req.get('voice', 'af_heart'))
            lang = str(req.get('lang', 'en-us'))
            speed = float(req.get('speed', 1.0))
        except (ValueError, json.JSONDecodeError):
            return self._error(400, 'petición no válida')
        if not text:
            return self._error(400, 'nada que decir')
        if voice not in VOICES:
            return self._error(400, f'voz desconocida: {voice}')
        with lock:
            samples, rate = kokoro.create(text, voice=voice, speed=max(0.5, min(speed, 2.0)), lang=lang)
        self._send(200, to_wav(samples, rate), 'audio/wav')

    def log_message(self, fmt: str, *args) -> None:  # sin ruido en el log
        pass


if __name__ == '__main__':
    print(f'Kokoro escuchando en 127.0.0.1:{PORT}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
