import Foundation
import UIKit
import Capacitor
import EventKit
import AVFoundation
import PhotosUI
import CoreLocation
import UniformTypeIdentifiers

// Passen i telefonens kalender (Carl 2026-11-22: "vi gör ett nytt bygge som gör så att de prenumererar på
// kalenderflödet"). iOS låter inte en app lägga till en prenumererad kalender, men med föräldrarnas tillstånd kan
// appen själv hålla en egen kalender, "CAP", i takt med bokningarna. Webben (js/kalender.js) skickar familjens
// kommande pass; tillägget lägger till nya, ändrar flyttade och tar bort avbokade. Varje händelse känns igen på
// sin url capkal://<vecka>-<tid>. Bara händelser i CAP-kalendern rörs, aldrig något annat i telefonens kalender.
//   status()                      → {behorighet: ja|fraga|nej|skriv, harKalender}
//   synka({handelser, fraga})     → {ok, behorighet, skapade, andrade, borttagna, larm: true}   fraga: false = be inte om tillstånd
//                                   händelse: {id, start, slut, titel, plats, anteckning, larm: [minuter före], paminnMin}
//                                   (Carl 2026-11-24: larm 24 h före + "dags att åka"; platsen får koordinater, så att
//                                   kalendern kan visa vägen och iPhonens egen "Dags att åka")
//   avsluta()                     → tar bort CAP-kalendern (utloggning, raderat konto, avstängt)
//   media()                       → {kamera, mikrofon}: ja|fraga|nej   (app 1.3, frågorna på sidan Sista steget)
//   mediaFraga({typ})             → {ok, behorighet}   typ: kamera|mikrofon
@objc(CapKalenderPlugin)
public class CapKalenderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CapKalenderPlugin"
    public let jsName = "CapKalender"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "synka", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "avsluta", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "media", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mediaFraga", returnType: CAPPluginReturnPromise)
    ]
    private let store = EKEventStore()
    private let nyckel = "capKalenderId"
    private let ko = DispatchQueue(label: "se.completeathletic.caponline.kalender")

    private func behorighet() -> String {
        let s = EKEventStore.authorizationStatus(for: .event)
        if s == .notDetermined { return "fraga" }
        if #available(iOS 17.0, *) {
            if s == .fullAccess { return "ja" }
            if s == .writeOnly { return "skriv" }
            return "nej"
        }
        return s.rawValue == 3 ? "ja" : "nej" // 3 = authorized före iOS 17
    }

    private func beOmTillstand(_ klar: @escaping (Bool) -> Void) {
        if #available(iOS 17.0, *) {
            store.requestFullAccessToEvents { ok, _ in klar(ok) }
        } else {
            store.requestAccess(to: .event) { ok, _ in klar(ok) }
        }
    }

    private func sparadKalender() -> EKCalendar? {
        guard let id = UserDefaults.standard.string(forKey: nyckel) else { return nil }
        return store.calendar(withIdentifier: id)
    }

    // CAP-kalendern: den sparade, en befintlig som heter CAP, annars en ny (iCloud om det går, annars på telefonen)
    private func kalender() throws -> EKCalendar {
        if let k = sparadKalender() { return k }
        if let k = store.calendars(for: .event).first(where: { $0.title == "CAP" && $0.allowsContentModifications }) {
            UserDefaults.standard.set(k.calendarIdentifier, forKey: nyckel)
            return k
        }
        var kallor: [EKSource] = []
        if let s = store.defaultCalendarForNewEvents?.source { kallor.append(s) }
        kallor += store.sources.filter { $0.sourceType == .calDAV && $0.title.lowercased().contains("icloud") }
        kallor += store.sources.filter { $0.sourceType == .local }
        var senasteFel: Error?
        for kalla in kallor {
            let k = EKCalendar(for: .event, eventStore: store)
            k.title = "CAP"
            k.cgColor = UIColor(red: 0, green: 0.83, blue: 0.80, alpha: 1).cgColor
            k.source = kalla
            do {
                try store.saveCalendar(k, commit: true)
                UserDefaults.standard.set(k.calendarIdentifier, forKey: nyckel)
                return k
            } catch { senasteFel = error }
        }
        throw senasteFel ?? NSError(domain: "CapKalender", code: 1, userInfo: [NSLocalizedDescriptionKey: "Hittade ingen kalender att spara i"])
    }

    @objc func status(_ call: CAPPluginCall) {
        call.resolve(["behorighet": behorighet(), "harKalender": behorighet() == "ja" && sparadKalender() != nil])
    }

    @objc func synka(_ call: CAPPluginCall) {
        let lista = call.getArray("handelser", JSObject.self) ?? []
        let fraga = call.getBool("fraga") ?? true
        let b = behorighet()
        if b == "ja" { ko.async { self.gor(call, lista) }; return }
        if b == "fraga" && fraga {
            beOmTillstand { ok in
                if ok { self.ko.async { self.gor(call, lista) } } else { call.resolve(["ok": false, "behorighet": "nej"]) }
            }
            return
        }
        call.resolve(["ok": false, "behorighet": b])
    }

    // Platsens koordinater (t.ex. "Backavallen, Göteborg"), sparade i telefonen så att varje plats slås upp en gång
    private let geoNyckel = "capKalenderGeo"
    private func koordinater(_ plats: String) -> CLLocation? {
        var cache = (UserDefaults.standard.dictionary(forKey: geoNyckel) as? [String: [Double]]) ?? [:]
        if let c = cache[plats], c.count == 2 { return CLLocation(latitude: c[0], longitude: c[1]) }
        let sem = DispatchSemaphore(value: 0)
        var hittad: CLLocation?
        CLGeocoder().geocodeAddressString(plats.contains("Sverige") ? plats : "\(plats), Sverige") { m, _ in hittad = m?.first?.location; sem.signal() }
        _ = sem.wait(timeout: .now() + 6)
        if let g = hittad { cache[plats] = [g.coordinate.latitude, g.coordinate.longitude]; UserDefaults.standard.set(cache, forKey: geoNyckel) }
        return hittad
    }

    private func gor(_ call: CAPPluginCall, _ lista: [JSObject]) {
        do {
            let k = try kalender()
            let isoMs = ISO8601DateFormatter()
            isoMs.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let iso = ISO8601DateFormatter()
            func datum(_ v: JSValue?) -> Date? { guard let s = v as? String else { return nil }; return isoMs.date(from: s) ?? iso.date(from: s) }
            func tal(_ v: JSValue?) -> Double? { (v as? NSNumber)?.doubleValue ?? (v as? Double) ?? (v as? Int).map(Double.init) }

            let fran = Date().addingTimeInterval(-14 * 86400), till = Date().addingTimeInterval(400 * 86400)
            let finns = store.events(matching: store.predicateForEvents(withStart: fran, end: till, calendars: [k]))
            var perId: [String: EKEvent] = [:]
            for e in finns {
                if let u = e.url?.absoluteString, u.hasPrefix("capkal://") { perId[String(u.dropFirst(9))] = e }
            }
            var skapade = 0, andrade = 0, borttagna = 0
            var sedda = Set<String>()
            for h in lista {
                guard let id = h["id"] as? String, let start = datum(h["start"]), let slut = datum(h["slut"]) else { continue }
                sedda.insert(id)
                let titel = (h["titel"] as? String) ?? "Träning med CAP"
                let plats = h["plats"] as? String
                let anteckning = h["anteckning"] as? String
                let minuter = tal(h["paminnMin"]) ?? 60
                let larm: [Double] = ((h["larm"] as? JSArray)?.compactMap { tal($0) }).flatMap { $0.isEmpty ? nil : $0 } ?? [minuter]
                let geo = plats.flatMap { koordinater($0) }
                let gammal = perId[id]
                if let e = gammal, e.title == titel, e.startDate == start, e.endDate == slut, e.location == plats, e.notes == anteckning,
                   Set((e.alarms ?? []).map { $0.relativeOffset }) == Set(larm.map { -$0 * 60 }),
                   (e.structuredLocation?.geoLocation != nil) == (geo != nil) { continue }
                let e = gammal ?? EKEvent(eventStore: store)
                e.calendar = k
                e.title = titel
                e.startDate = start
                e.endDate = slut
                e.location = plats
                if let plats = plats {
                    let sl = EKStructuredLocation(title: plats)
                    if let g = geo { sl.geoLocation = g; sl.radius = 150 }
                    e.structuredLocation = sl
                }
                e.notes = anteckning
                e.url = URL(string: "capkal://\(id)")
                e.alarms = larm.map { EKAlarm(relativeOffset: -$0 * 60) }
                try store.save(e, span: .thisEvent, commit: false)
                if gammal == nil { skapade += 1 } else { andrade += 1 }
            }
            // avbokade och flyttade: kommande händelser som inte längre finns i listan
            for (id, e) in perId where !sedda.contains(id) && e.endDate > Date() {
                try store.remove(e, span: .thisEvent, commit: false)
                borttagna += 1
            }
            try store.commit()
            call.resolve(["ok": true, "behorighet": "ja", "skapade": skapade, "andrade": andrade, "borttagna": borttagna, "larm": true])
        } catch {
            store.reset()
            call.resolve(["ok": false, "behorighet": behorighet(), "fel": error.localizedDescription])
        }
    }

    // Kameran och mikrofonen (Carl 2026-11-23: "allt annat som appen kräver"): föräldrarna filmar stegen i stigen,
    // Haris filmar och spelar in under passen. Att filma med ljud kräver både kamera och mikrofon.
    private func mediaLage(_ t: AVMediaType) -> String {
        switch AVCaptureDevice.authorizationStatus(for: t) {
        case .authorized: return "ja"
        case .notDetermined: return "fraga"
        default: return "nej"
        }
    }

    @objc func media(_ call: CAPPluginCall) {
        call.resolve(["kamera": mediaLage(.video), "mikrofon": mediaLage(.audio)])
    }

    @objc func mediaFraga(_ call: CAPPluginCall) {
        let t: AVMediaType = call.getString("typ") == "mikrofon" ? .audio : .video
        if mediaLage(t) != "fraga" { call.resolve(["ok": mediaLage(t) == "ja", "behorighet": mediaLage(t)]); return }
        AVCaptureDevice.requestAccess(for: t) { ok in call.resolve(["ok": ok, "behorighet": ok ? "ja" : "nej"]) }
    }

    @objc func avsluta(_ call: CAPPluginCall) {
        ko.async {
            if self.behorighet() == "ja", let k = self.sparadKalender() { try? self.store.removeCalendar(k, commit: true) }
            UserDefaults.standard.removeObject(forKey: self.nyckel)
            call.resolve(["ok": true])
        }
    }
}

// Filmerna från passen (Carl 2026-11-24: "vi ska komprimera filmerna, så att vi inte går över 10 gb"). Telefonen
// filmar i full kvalitet (~50 MB/min). Tillägget filmar (eller tar en film ur biblioteket), gör om den till 720p
// H.264 ~1,8 Mbit/s + AAC (~14 MB/min) och laddar upp den i delar till API:t. Webben laddas från GitHub Pages och
// kan inte läsa appens filer, så uppladdningen görs här; webben får adressen tillbaka.
//   filma({id, kalla: kamera|bibliotek, maxSek})  → {id, sek, fore, efter} (byte) eller {avbrutet: true}
//   laddaUpp({id, api, token, klientId, filnamn})  → {ok, url, key, storlek} eller {ok: false, fel}
//   vantande()                                     → {filer: [{id, storlek}]}   komprimerade filmer som inte laddats upp
//   taBort({id})
//   händelsen filmFramsteg {steg: komprimerar|laddar, andel 0–1}
@objc(CapFilmPlugin)
public class CapFilmPlugin: CAPPlugin, CAPBridgedPlugin, UIImagePickerControllerDelegate, UINavigationControllerDelegate, PHPickerViewControllerDelegate {
    public let identifier = "CapFilmPlugin"
    public let jsName = "CapFilm"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "filma", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "laddaUpp", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "vantande", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "taBort", returnType: CAPPluginReturnPromise)
    ]
    private var aktiv: CAPPluginCall?
    private let ko = DispatchQueue(label: "se.completeathletic.caponline.film", qos: .userInitiated)
    private let langsta: CGFloat = 1280, bitar = 1_800_000

    private var mapp: URL {
        let u = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("cap-film", isDirectory: true)
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }
    private func fil(_ id: String) -> URL { mapp.appendingPathComponent("\(id).mp4") }
    private func rentId(_ s: String?) -> String? {
        guard let s = s, !s.isEmpty, s.count <= 40, s.allSatisfy({ $0.isLetter || $0.isNumber }) else { return nil }
        return s
    }
    private func storlek(_ u: URL) -> Int { ((try? FileManager.default.attributesOfItem(atPath: u.path)[.size]) as? NSNumber)?.intValue ?? 0 }

    // ---------- filma eller välja ----------
    @objc func filma(_ call: CAPPluginCall) {
        guard rentId(call.getString("id")) != nil else { call.reject("id saknas"); return }
        aktiv = call
        let bibliotek = call.getString("kalla") == "bibliotek"
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController else { self.aktiv = nil; call.reject("ingen vy"); return }
            if bibliotek || !UIImagePickerController.isSourceTypeAvailable(.camera) {
                var cfg = PHPickerConfiguration()
                cfg.filter = .videos; cfg.selectionLimit = 1; cfg.preferredAssetRepresentationMode = .current
                let p = PHPickerViewController(configuration: cfg); p.delegate = self
                vc.present(p, animated: true)
            } else {
                let p = UIImagePickerController()
                p.sourceType = .camera; p.mediaTypes = ["public.movie"]; p.cameraCaptureMode = .video
                p.videoQuality = .typeHigh
                p.videoMaximumDuration = TimeInterval(max(10, min(1800, call.getInt("maxSek") ?? 900)))
                p.delegate = self
                vc.present(p, animated: true)
            }
        }
    }
    public func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true); aktiv?.resolve(["avbrutet": true]); aktiv = nil
    }
    public func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        picker.dismiss(animated: true)
        guard let u = info[.mediaURL] as? URL else { aktiv?.reject("ingen film"); aktiv = nil; return }
        ko.async { self.gorOm(u, radera: true) }
    }
    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let r = results.first else { aktiv?.resolve(["avbrutet": true]); aktiv = nil; return }
        r.itemProvider.loadFileRepresentation(forTypeIdentifier: UTType.movie.identifier) { url, err in
            guard let url = url else { self.aktiv?.reject("kunde inte läsa filmen: \(err?.localizedDescription ?? "")"); self.aktiv = nil; return }
            // filen finns bara medan blocket körs: kopiera först
            let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "." + (url.pathExtension.isEmpty ? "mov" : url.pathExtension))
            do { try FileManager.default.copyItem(at: url, to: tmp) } catch { self.aktiv?.reject("kunde inte kopiera filmen"); self.aktiv = nil; return }
            self.ko.async { self.gorOm(tmp, radera: true) }
        }
    }

    private func gorOm(_ in_: URL, radera: Bool) {
        guard let call = aktiv, let id = rentId(call.getString("id")) else { return }
        aktiv = nil
        let ut = fil(id)
        try? FileManager.default.removeItem(at: ut)
        let fore = storlek(in_)
        komprimera(in_, ut) { fel, sek in
            if radera { try? FileManager.default.removeItem(at: in_) }
            if let fel = fel { try? FileManager.default.removeItem(at: ut); call.reject("kunde inte göra om filmen: \(fel.localizedDescription)"); return }
            call.resolve(["id": id, "sek": sek, "fore": fore, "efter": self.storlek(ut)])
        }
    }

    // AVAssetReader → AVAssetWriter: längsta sidan högst 1280, H.264 med fast bithastighet, ljudet AAC 96 kbit/s
    private func komprimera(_ in_: URL, _ ut: URL, klar: @escaping (Error?, Double) -> Void) {
        let asset = AVURLAsset(url: in_)
        let sek = CMTimeGetSeconds(asset.duration)
        guard let vt = asset.tracks(withMediaType: .video).first else { klar(NSError(domain: "CapFilm", code: 1, userInfo: [NSLocalizedDescriptionKey: "filmen saknar bild"]), 0); return }
        let at = asset.tracks(withMediaType: .audio).first
        let n = vt.naturalSize
        let w = abs(n.width), h = abs(n.height)
        let skala = min(1, langsta / max(w, h, 1))
        let tw = max(2, Int((w * skala / 2).rounded()) * 2), th = max(2, Int((h * skala / 2).rounded()) * 2)
        do {
            let reader = try AVAssetReader(asset: asset)
            let vOut = AVAssetReaderTrackOutput(track: vt, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange])
            vOut.alwaysCopiesSampleData = false
            reader.add(vOut)
            var aOut: AVAssetReaderTrackOutput?
            if let at = at { let o = AVAssetReaderTrackOutput(track: at, outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM]); o.alwaysCopiesSampleData = false; reader.add(o); aOut = o }
            let writer = try AVAssetWriter(outputURL: ut, fileType: .mp4)
            writer.shouldOptimizeForNetworkUse = true
            let vIn = AVAssetWriterInput(mediaType: .video, outputSettings: [
                AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: tw, AVVideoHeightKey: th,
                AVVideoScalingModeKey: AVVideoScalingModeResizeAspect,
                AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: bitar, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel, AVVideoMaxKeyFrameIntervalDurationKey: 2],
            ])
            vIn.transform = vt.preferredTransform
            vIn.expectsMediaDataInRealTime = false
            writer.add(vIn)
            var aIn: AVAssetWriterInput?
            if aOut != nil {
                let i = AVAssetWriterInput(mediaType: .audio, outputSettings: [AVFormatIDKey: kAudioFormatMPEG4AAC, AVNumberOfChannelsKey: 2, AVSampleRateKey: 44100, AVEncoderBitRateKey: 96000])
                i.expectsMediaDataInRealTime = false
                if writer.canAdd(i) { writer.add(i); aIn = i } else { aOut = nil }
            }
            guard writer.startWriting(), reader.startReading() else { klar(writer.error ?? reader.error, 0); return }
            writer.startSession(atSourceTime: .zero)
            let grupp = DispatchGroup()
            var senast = 0.0
            func pump(_ input: AVAssetWriterInput, _ out: AVAssetReaderTrackOutput, _ q: DispatchQueue, bild: Bool) {
                grupp.enter()
                var klart = false
                input.requestMediaDataWhenReady(on: q) {
                    if klart { return }
                    while input.isReadyForMoreMediaData {
                        guard let sb = out.copyNextSampleBuffer() else { klart = true; input.markAsFinished(); grupp.leave(); return }
                        if bild, sek > 0 {
                            let a = min(1, CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sb)) / sek)
                            if a - senast > 0.02 { senast = a; self.notifyListeners("filmFramsteg", data: ["steg": "komprimerar", "andel": a]) }
                        }
                        if !input.append(sb) { klart = true; reader.cancelReading(); input.markAsFinished(); grupp.leave(); return }
                    }
                }
            }
            pump(vIn, vOut, DispatchQueue(label: "cap.film.bild"), bild: true)
            if let aIn = aIn, let aOut = aOut { pump(aIn, aOut, DispatchQueue(label: "cap.film.ljud"), bild: false) }
            grupp.notify(queue: ko) {
                if reader.status == .failed || writer.status == .failed { writer.cancelWriting(); klar(writer.error ?? reader.error, sek); return }
                writer.finishWriting { klar(writer.status == .completed ? nil : writer.error, sek) }
            }
        } catch { klar(error, sek) }
    }

    // ---------- uppladdning i delar (samma API som webben: /admin/upload/start|part|complete) ----------
    private func anrop(_ req: URLRequest, kropp: Data? = nil) -> (Int, [String: Any]) {
        let sem = DispatchSemaphore(value: 0)
        var status = 0, json: [String: Any] = [:]
        var r = req; r.timeoutInterval = 120
        let svar: (Data?, URLResponse?, Error?) -> Void = { d, resp, _ in
            status = (resp as? HTTPURLResponse)?.statusCode ?? 0
            if let d = d, let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any] { json = o }
            sem.signal()
        }
        let t: URLSessionTask
        if let kropp = kropp { t = URLSession.shared.uploadTask(with: r, from: kropp, completionHandler: svar) }
        else { t = URLSession.shared.dataTask(with: r, completionHandler: svar) }
        t.resume(); sem.wait()
        return (status, json)
    }
    private func jsonAnrop(_ url: URL, _ token: String, _ body: [String: Any]) -> (Int, [String: Any]) {
        var r = URLRequest(url: url); r.httpMethod = "POST"
        r.setValue("application/json", forHTTPHeaderField: "Content-Type"); r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        r.httpBody = try? JSONSerialization.data(withJSONObject: body)
        return anrop(r)
    }

    @objc func laddaUpp(_ call: CAPPluginCall) {
        guard let id = rentId(call.getString("id")), let api = call.getString("api"), let token = call.getString("token"),
              let bas = URL(string: api) else { call.reject("saknar id/api/token"); return }
        let klientId = call.getString("klientId") ?? "", filnamn = call.getString("filnamn") ?? "\(id).mp4"
        ko.async {
            let u = self.fil(id)
            let total = self.storlek(u)
            guard total > 0, let fh = try? FileHandle(forReadingFrom: u) else { call.resolve(["ok": false, "fel": "filmen finns inte på telefonen"]); return }
            defer { try? fh.close() }
            let (s0, start) = self.jsonAnrop(bas.appendingPathComponent("admin/upload/start"), token, ["klientId": klientId, "filnamn": filnamn, "typ": "video/mp4", "storlek": total])
            guard s0 == 200, start["ok"] as? Bool == true, let key = start["key"] as? String, let upId = start["uploadId"] as? String else {
                call.resolve(["ok": false, "fel": (start["fel"] as? String) ?? "uppladdningen kunde inte starta (\(s0))"]); return
            }
            let del = 8 * 1024 * 1024
            let antal = (total + del - 1) / del
            var parts: [[String: Any]] = []
            for i in 0..<antal {
                fh.seek(toFileOffset: UInt64(i * del))
                let data = fh.readData(ofLength: del)
                var c = URLComponents(url: bas.appendingPathComponent("admin/upload/part"), resolvingAgainstBaseURL: false)!
                c.queryItems = [URLQueryItem(name: "key", value: key), URLQueryItem(name: "uploadId", value: upId), URLQueryItem(name: "part", value: String(i + 1))]
                var r = URLRequest(url: c.url!); r.httpMethod = "PUT"; r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                var (s, j) = self.anrop(r, kropp: data)
                if s != 200 { (s, j) = self.anrop(r, kropp: data) } // ett nytt försök vid dålig täckning
                guard s == 200, let etag = j["etag"] as? String else { call.resolve(["ok": false, "fel": "del \(i + 1) av \(antal): \((j["fel"] as? String) ?? String(s))"]); return }
                parts.append(["partNumber": i + 1, "etag": etag])
                self.notifyListeners("filmFramsteg", data: ["steg": "laddar", "andel": Double(i + 1) / Double(antal)])
            }
            let (s2, klar) = self.jsonAnrop(bas.appendingPathComponent("admin/upload/complete"), token, ["key": key, "uploadId": upId, "parts": parts])
            guard s2 == 200, klar["ok"] as? Bool == true, let url = klar["url"] as? String else { call.resolve(["ok": false, "fel": (klar["fel"] as? String) ?? "kunde inte avsluta uppladdningen (\(s2))"]); return }
            try? FileManager.default.removeItem(at: u)
            call.resolve(["ok": true, "url": url, "key": key, "storlek": total])
        }
    }

    @objc func vantande(_ call: CAPPluginCall) {
        let filer = ((try? FileManager.default.contentsOfDirectory(at: mapp, includingPropertiesForKeys: nil)) ?? [])
            .filter { $0.pathExtension == "mp4" }.map { ["id": $0.deletingPathExtension().lastPathComponent, "storlek": storlek($0)] as [String: Any] }
        call.resolve(["filer": filer])
    }
    @objc func taBort(_ call: CAPPluginCall) {
        if let id = rentId(call.getString("id")) { try? FileManager.default.removeItem(at: fil(id)) }
        call.resolve(["ok": true])
    }
}

// Appens vy: Capacitors egen, plus tilläggen ovan (de ligger i appen, inte i npm-paket).
class CapViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CapKalenderPlugin())
        bridge?.registerPluginInstance(CapFilmPlugin())
    }
}
