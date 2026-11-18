// Voz de Claudio en español sin `say`: un servicio que carga las voces de macOS (Jorge y
// Mónica mejoradas) una sola vez y se queda esperando. `say` tarda ~0,7 s por frase en
// arrancar y cargar la voz; aquí una frase sale en ~0,05 s.
//
//   POST http://127.0.0.1:3122/  {"text": "Hola", "voice": "Jorge (Enhanced)"}  → audio/wav
//   GET  http://127.0.0.1:3122/health                                          → ok
//
// Solo escucha en 127.0.0.1. Lo compila e instala scripts/install-voice.sh (LaunchAgent
// com.deimos97.claudio.voice). Si no está, server/voice.ts usa `say` como antes.
import AVFoundation
import Foundation
import Network

let PORT: UInt16 = 3122
let WARM = ["Jorge (Enhanced)", "Mónica (Enhanced)"]
let MAX_BODY = 64 * 1024

func log(_ s: String) { FileHandle.standardError.write("\(Date()) \(s)\n".data(using: .utf8)!) }

// ---------- voces ----------
var voiceCache: [String: AVSpeechSynthesisVoice] = [:]
func findVoice(_ name: String) -> AVSpeechSynthesisVoice? {
  if let v = voiceCache[name] { return v }
  let all = AVSpeechSynthesisVoice.speechVoices()
  let v = all.first { $0.identifier == name } ?? all.first { $0.name == name }
    ?? all.first { $0.name.hasPrefix(name.components(separatedBy: " (").first ?? name) && $0.language.hasPrefix("es") }
  if let v { voiceCache[name] = v }
  return v
}

// ---------- síntesis: una frase cada vez, con el mismo sintetizador ----------
let synth = AVSpeechSynthesizer()
struct Job { let text: String; let voice: AVSpeechSynthesisVoice; let reply: (Data?) -> Void }
var queue: [Job] = []
var busy = false

func enqueue(_ job: Job) { queue.append(job); pump() }
func pump() {
  guard !busy, !queue.isEmpty else { return }
  busy = true
  let job = queue.removeFirst()
  var samples: [Int16] = []
  var rate = 22050.0
  var finished = false
  let finish = { (ok: Bool) in
    if finished { return }
    finished = true
    job.reply(ok ? wav(samples, rate: Int(rate)) : nil)
    busy = false
    DispatchQueue.main.async { pump() }
  }
  let u = AVSpeechUtterance(string: job.text)
  u.voice = job.voice
  synth.write(u) { buf in
    guard let pcm = buf as? AVAudioPCMBuffer else { return }
    if pcm.frameLength == 0 { finish(true); return }
    rate = pcm.format.sampleRate
    let n = Int(pcm.frameLength)
    if let f = pcm.floatChannelData?[0] {
      for i in 0..<n { samples.append(Int16(max(-1, min(1, f[i])) * 32767)) }
    } else if let s = pcm.int16ChannelData?[0] {
      samples.append(contentsOf: UnsafeBufferPointer(start: s, count: n))
    }
  }
  // Por si el sintetizador no avisa del final (texto vacío o raro)
  DispatchQueue.main.asyncAfter(deadline: .now() + 15) { finish(!samples.isEmpty) }
}

func wav(_ s: [Int16], rate: Int) -> Data {
  var d = Data()
  func u32(_ v: UInt32) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 4)) }
  func u16(_ v: UInt16) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 2)) }
  let bytes = UInt32(s.count * 2)
  d.append("RIFF".data(using: .ascii)!); u32(36 + bytes); d.append("WAVE".data(using: .ascii)!)
  d.append("fmt ".data(using: .ascii)!); u32(16); u16(1); u16(1); u32(UInt32(rate)); u32(UInt32(rate * 2)); u16(2); u16(16)
  d.append("data".data(using: .ascii)!); u32(bytes)
  s.withUnsafeBufferPointer { d.append(Data(buffer: $0)) }
  return d
}

// ---------- HTTP mínimo ----------
func respond(_ c: NWConnection, _ status: String, _ type: String, _ body: Data) {
  var head = "HTTP/1.1 \(status)\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\nConnection: close\r\n\r\n".data(using: .utf8)!
  head.append(body)
  c.send(content: head, completion: .contentProcessed { _ in c.cancel() })
}
func text(_ c: NWConnection, _ status: String, _ msg: String) { respond(c, status, "text/plain; charset=utf-8", msg.data(using: .utf8)!) }

func handle(_ c: NWConnection, _ buf: Data) {
  guard let end = buf.range(of: Data("\r\n\r\n".utf8)) else {
    if buf.count > MAX_BODY { return text(c, "413 Payload Too Large", "demasiado grande") }
    return receive(c, buf)
  }
  let head = String(decoding: buf[..<end.lowerBound], as: UTF8.self)
  let lines = head.components(separatedBy: "\r\n")
  let parts = (lines.first ?? "").split(separator: " ")
  let method = parts.first.map(String.init) ?? ""
  let path = parts.count > 1 ? String(parts[1]) : "/"
  if method == "GET" && path == "/health" { return text(c, "200 OK", "ok") }
  guard method == "POST" else { return text(c, "405 Method Not Allowed", "solo POST") }
  let length = lines.compactMap { l -> Int? in
    let kv = l.split(separator: ":", maxSplits: 1)
    return kv.count == 2 && kv[0].lowercased() == "content-length" ? Int(kv[1].trimmingCharacters(in: .whitespaces)) : nil
  }.first ?? 0
  if length > MAX_BODY { return text(c, "413 Payload Too Large", "demasiado grande") }
  let body = buf[end.upperBound...]
  if body.count < length { return receive(c, buf) }
  guard let json = try? JSONSerialization.jsonObject(with: Data(body.prefix(length))) as? [String: Any],
        let t = (json["text"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else {
    return text(c, "400 Bad Request", "falta text")
  }
  let name = json["voice"] as? String ?? WARM[0]
  guard let v = findVoice(name) else { return text(c, "404 Not Found", "no existe la voz \(name)") }
  let t0 = Date()
  enqueue(Job(text: String(t.prefix(1500)), voice: v) { data in
    guard let data else { return text(c, "500 Internal Server Error", "no ha salido audio") }
    log(String(format: "%.0f ms · %@ · %d B", Date().timeIntervalSince(t0) * 1000, v.name, data.count))
    respond(c, "200 OK", "audio/wav", data)
  })
}
func receive(_ c: NWConnection, _ buf: Data) {
  c.receive(minimumIncompleteLength: 1, maximumLength: 65536) { data, _, done, err in
    if err != nil { c.cancel(); return }
    var b = buf
    if let data { b.append(data) }
    if done && data == nil { c.cancel(); return }
    DispatchQueue.main.async { handle(c, b) }
  }
}

// ---------- arranque ----------
let params = NWParameters.tcp
params.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: PORT)!)
params.allowLocalEndpointReuse = true
let listener = try NWListener(using: params)
listener.newConnectionHandler = { c in
  c.start(queue: .main)
  receive(c, Data())
}
listener.stateUpdateHandler = { s in
  if case .failed(let e) = s { log("no puedo escuchar en \(PORT): \(e)"); exit(1) }
  if case .ready = s { log("voz de Claudio en 127.0.0.1:\(PORT)") }
}
listener.start(queue: .main)

// Calentar: la primera frase de cada voz carga el modelo (~0,4 s); que no le toque a nadie
for name in WARM {
  if let v = findVoice(name) { enqueue(Job(text: "Hola.", voice: v) { _ in log("voz lista: \(v.name)") }) }
  else { log("no encuentro la voz \(name)") }
}
dispatchMain()
