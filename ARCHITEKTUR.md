# 🏛️ Architektur & Programmier-Prinzipien – Kühlschrank Scan AI

Diese Dokumentation beschreibt die Systemarchitektur, den Datenfluss sowie die angewandten Software-Design- und Clean-Code-Prinzipien der **Kühlschrank Scan AI** Anwendung.

---

## 1. Systemübersicht

**Kühlschrank Scan AI** ist eine moderne, responsive Full-Stack PWA & Capacitor Webapplikation zur digitalen Verwaltung von Lebensmitteln und automatischen Haltbarkeitserkennung per Barcode- & OCR-KI-Scan.

### Hauptfunktionen
1. **Intelligentes Inventar**: Verwaltung von Lebensmitteln nach Kategorien, Lagerorten (Kühlschrank, Gefrierfach, Schrank) und Mindesthaltbarkeitsdatum (MHD) bzw. Tagen im Kühlschrank (TiK).
2. **Barcode- & Foto-Scan Workflow**: 
   - **Multi-Level Barcode-Erkennung**: On-Device ML Kit Scanner (Native Capacitor) / Web Kamera (Html5Qrcode) → Direct Open Food Facts v2 API → Server API Proxy → Lokaler Fallback.
   - **MHD OCR-Erkennung**: Zweiphasige Erkennung: Blitzschnelle lokale Tesseract/Regex-Analyse (<500ms) → KI-Vision-Fallback (Gemini 3.6 Flash / 2.5 Flash).
   - **KI-Foto-Scan**: Multimodale Bildanalyse zur Erfassung kompletter Kühlschrank-Inhalte.
3. **Multi-Gruppen & WG-Verwaltung (`GruppeView.tsx`)**: Unterstützung verschiedener Haushalte (z. B. WG, Zuhause, Büro) und anpassbaren Lagerorten.

---

## 2. Software-Architektur & Systemkomponenten

Die Anwendung folgt einer **Full-Stack Client-Server Architektur** mit klarer Trennung von Frontend, API-Service-Schicht, Backend-Express-Server und externen KI-/Daten-Diensten.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          React Frontend (Client)                       │
│                                                                        │
│  ┌────────────────────────┐   ┌────────────────────────┐               │
│  │  UI Components         │   │  Local Storage         │               │
│  │  (Inventar, Scanner,   │ ◄─┼── Persistence          │               │
│  │   GruppeView, Setup)   │   │  (kuehlschrank_*)      │               │
│  └───────────┬────────────┘   └────────────────────────┘               │
│              │                                                         │
│              ▼                                                         │
│  ┌──────────────────────────────────────────────────┐                  │
│  │  Centralized API Service Layer                   │                  │
│  │  (/src/services/api.ts)                          │                  │
│  └───────────┬──────────────────────────────────────┘                  │
└──────────────┼─────────────────────────────────────────────────────────┘
               │ HTTP JSON Requests (/api/*)
               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          Express Backend (Server)                      │
│                          (server.ts - Port 3000)                       │
│                                                                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │ /api/scan-fridge │  │ /api/scan-mhd    │  │ /api/barcode-lookup  │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘  │
└───────────┬─────────────────────┬───────────────────────┬──────────────┘
            │                     │                       │
            ▼                     ▼                       ▼
┌────────────────────────────────────────┐   ┌───────────────────────────┐
│ Google Gemini API                      │   │ Open Food Facts API (v2)  │
│ (Primary: gemini-3.6-flash,            │   │ (EAN/Barcode Produktdaten)│
│  Fallback: gemini-2.5-flash)           │   │                           │
└────────────────────────────────────────┘   └───────────────────────────┘
```

---

## 3. Angewandte Programmier-Prinzipien

### 3.1 Single Responsibility Principle (SRP)
Jedes Modul erfüllt exakt eine klare Aufgabe:
- **`src/types.ts`**: Enthält saubere, globale TypeScript-Typdefinitionen und Interfaces für das gesamte Domain-Modell.
- **`src/utils/helpers.ts`**: Reine Hilfsfunktionen für Datumsberechnungen, MHD-Status-Klassifizierung und LocalStorage.
- **`src/utils/localOcr.ts`**: Lokale OCR-Logik (Regex-Parser & Tesseract) zur schnellen Datums-Extraktion.
- **`src/services/api.ts`**: Kapselt alle Netzwerkaufrufe (`fetch`) zum Express-Backend ab. UI-Komponenten führen keine direkten HTTP-Aufrufe mehr aus.
- **`server.ts`**: Behandelt API-Endpunkte, Anfragen-Validierung, Fallback-Modelle und die Kommunikation mit Gemini & Open Food Facts.

### 3.2 Don't Repeat Yourself (DRY) & Modularisierung
- **Zentrale API-Schicht (`/src/services/api.ts`)**: Bündelt Barcode-Lookup, MHD-Scan und Foto-Analysen in wiederverwendbaren typisierten Funktionen.
- **Performance durch `useMemo`**: Filter- und Sortier-Operationen im Inventar werden speichereffizient memoisiert.
- **Wiederverwendbare UI-Elemente**: Navigationsleiste (`BottomNav`) und Inventar-Filter.

### 3.3 Graceful Degradation & Fehlertoleranz (Resilience)
- **Mehrstufige Fallback-Kaskade bei Barcodes**:
  1. On-Device Native ML Kit Scanner (auf unterstützten Android/Capacitor-Geräten).
  2. Direktaufruf der Open Food Facts API v2 clientseitig (mit AbortController und 5s Timeout).
  3. Serverseitige Proxy-Abfrage über `/api/barcode-lookup`.
  4. Bei Offline/Netzwerkfehler: Generierung eines sicheren lokalen Fallback-Objekts.
- **Zweiphasiger MHD-Scan**:
  1. Phase 1: On-Device Lokale Erkennung (<500ms).
  2. Phase 2: Gemini KI-Fallback (`gemini-3.6-flash` -> `gemini-2.5-flash`).
- **Fehlerfreie OCR-Verarbeitung**: Fällt die KI-Erkennung beim MHD-Scan aus, wird automatisch ein valides Datum (+14 Tage) vorausgewählt.

### 3.4 Unidirektionaler Datenfluss & Local-First Persistence
- State wird zentral auf oberster Ebene (`App.tsx`) verwaltet und per Props an Unterkomponenten übergeben.
- Der Zustand synchronisiert sich automatisch reaktiv mit `localStorage` (`kuehlschrank_inventory`, `kuehlschrank_groups`, `kuehlschrank_settings`).
- Nutzeraktionen (z.B. Artikel hinzufügen, löschen, Status verändern) werden sofort optimistisch im UI reflektiert.

### 3.5 API-Key Sicherheit & Server-Side Proxying
- Das `GEMINI_API_KEY` Geheimnis verbleibt strikt auf dem Server (`server.ts`) und wird **niemals** an den Browser übermittelt.
- Lazy-Initialization stellt sicher, dass das Gemini SDK erst beim ersten Aufruf intialisiert wird, ohne den Serverstart bei fehlenden Schlüsseln zu blockieren.

---

## 4. Komponenten- & Modulstruktur

| Pfad / Datei | Beschreibung |
| :--- | :--- |
| `server.ts` | Express Server-Einstiegspunkt für API-Routen & Vite-Middleware. |
| `src/App.tsx` | Hauptkomponente & State-Hub (Tabs, Inventar, Gruppen, Einstellungen). |
| `src/types.ts` | Typen & Schnittstellen (`InventoryItem`, `AppSettings` u.a.). |
| `src/services/api.ts` | API Client-Service zur Kapselung aller Backend-Aufrufe. |
| `src/services/nativeBarcodeScanner.ts` | Capacitor ML Kit Plugin Wrapper für Android Blitz-Scan. |
| `src/utils/helpers.ts` | Datumsberechnungen, MHD-Status & LocalStorage-Hilfsmittel. |
| `src/utils/localOcr.ts` | Lokale On-Device MHD Datums-Extraktion. |
| `src/data/initialData.ts` | Demodaten für Erstnutzer (WG-Gruppen, Test-Artikel, Standardwerte). |
| `src/components/InventarView.tsx` | Hauptansicht: Suche, Filter, Schnell-Aktionen, Liste ablaufender Artikel. |
| `src/components/ScannerPage.tsx` | 4-Schritt-Assistent (Ort/Modus → Scannen → Prüfen → MHD). |
| `src/components/GruppeView.tsx` | Haushalts- & Standortverwaltung (WG, Zuhause, Büro). |
| `src/components/SetupView.tsx` | Einstellungen für Warnungen, CSV Export/Import & Offline-Bilder. |
| `src/components/BottomNav.tsx` | Navigationsleiste am unteren Bildschirmrand. |

---

## 5. Backend API Endpunkte

| Endpunkt | Methode | Beschreibung | Externe Dienste |
| :--- | :--- | :--- | :--- |
| `/api/barcode-lookup` | `POST` | Erfasst Produktdaten zu einem Barcode/EAN. | Open Food Facts v2, Gemini 3.6/2.5 Flash |
| `/api/scan-fridge` | `POST` | Analysiert Fotos von Lebensmitteln/Kühlschränken. | Gemini 3.6/2.5 Flash (Vision) |
| `/api/scan-mhd` | `POST` | OCR-Texterkennung für MHD-Datum auf Verpackungen. | Gemini 3.6/2.5 Flash (Vision OCR) |

---

## 6. Zusammenfassung

Durch die Refactorings ist die Codebase:
1. **Sauber & Modular**: Klare Schichtenarchitektur (UI → API Service → Backend → External Services).
2. **Kompakt & DRY**: Keine doppelten `fetch`-Aufrufe, keine veralteten unused Files, saubere Types.
3. **Schnell & Effizient**: On-Device ML Kit & Tesseract OCR für schnelle lokale Scans, React `useMemo` für flüssige Filterungen.
4. **Robust & Ausfallsicher**: Mehrstufige Fallback-Strategien für Netzwerkausfälle, Gemini Modellausfälle oder unvollständige Eingaben.
