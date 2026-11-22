import Foundation
import UIKit
import Capacitor
import EventKit

// Passen i telefonens kalender (Carl 2026-11-22: "vi gör ett nytt bygge som gör så att de prenumererar på
// kalenderflödet"). iOS låter inte en app lägga till en prenumererad kalender, men med föräldrarnas tillstånd kan
// appen själv hålla en egen kalender, "CAP", i takt med bokningarna. Webben (js/kalender.js) skickar familjens
// kommande pass; tillägget lägger till nya, ändrar flyttade och tar bort avbokade. Varje händelse känns igen på
// sin url capkal://<vecka>-<tid>. Bara händelser i CAP-kalendern rörs, aldrig något annat i telefonens kalender.
//   status()                      → {behorighet: ja|fraga|nej|skriv, harKalender}
//   synka({handelser, fraga})     → {ok, behorighet, skapade, andrade, borttagna}   fraga: false = be inte om tillstånd
//   avsluta()                     → tar bort CAP-kalendern (utloggning, raderat konto, avstängt)
@objc(CapKalenderPlugin)
public class CapKalenderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CapKalenderPlugin"
    public let jsName = "CapKalender"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "synka", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "avsluta", returnType: CAPPluginReturnPromise)
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
                let gammal = perId[id]
                if let e = gammal, e.title == titel, e.startDate == start, e.endDate == slut, e.location == plats, e.notes == anteckning,
                   e.alarms?.first?.relativeOffset == -minuter * 60 { continue }
                let e = gammal ?? EKEvent(eventStore: store)
                e.calendar = k
                e.title = titel
                e.startDate = start
                e.endDate = slut
                e.location = plats
                e.notes = anteckning
                e.url = URL(string: "capkal://\(id)")
                e.alarms = [EKAlarm(relativeOffset: -minuter * 60)]
                try store.save(e, span: .thisEvent, commit: false)
                if gammal == nil { skapade += 1 } else { andrade += 1 }
            }
            // avbokade och flyttade: kommande händelser som inte längre finns i listan
            for (id, e) in perId where !sedda.contains(id) && e.endDate > Date() {
                try store.remove(e, span: .thisEvent, commit: false)
                borttagna += 1
            }
            try store.commit()
            call.resolve(["ok": true, "behorighet": "ja", "skapade": skapade, "andrade": andrade, "borttagna": borttagna])
        } catch {
            store.reset()
            call.resolve(["ok": false, "behorighet": behorighet(), "fel": error.localizedDescription])
        }
    }

    @objc func avsluta(_ call: CAPPluginCall) {
        ko.async {
            if self.behorighet() == "ja", let k = self.sparadKalender() { try? self.store.removeCalendar(k, commit: true) }
            UserDefaults.standard.removeObject(forKey: self.nyckel)
            call.resolve(["ok": true])
        }
    }
}

// Appens vy: Capacitors egen, plus kalendertillägget ovan (det ligger i appen, inte i ett npm-paket).
class CapViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CapKalenderPlugin())
    }
}
