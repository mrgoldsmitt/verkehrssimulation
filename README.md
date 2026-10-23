# 🚗 Verkehrssimulation

Interaktive, physikbasierte Verkehrssimulation im Browser mit dem **Intelligent Driver Model (IDM)**, realistischem Spurwechselverhalten (MOBIL-inspiriert) und verschiedenen Verkehrsszenarien.

[![Live Demo](https://img.shields.io/badge/Demo-Cloudflare%20Edge-F38020?style=flat&logo=cloudflare&logoColor=white)](https://verkehrssimulation.sebastian-d19.workers.dev)
![HTML5 Canvas](https://img.shields.io/badge/HTML5-Canvas-E34F26?style=flat&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla%20ES6+-F7DF1E?style=flat&logo=javascript&logoColor=black)
![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?style=flat)
![Version](https://img.shields.io/badge/Version-v0.1.0-blue?style=flat)
![License](https://img.shields.io/badge/License-MIT-green?style=flat)

---

## 🌐 Live-Demo

Die Anwendung wird weltweit über das Cloudflare Edge-Netzwerk gehostet:  
👉 **[https://verkehrssimulation.sebastian-d19.workers.dev](https://verkehrssimulation.sebastian-d19.workers.dev)**

---

## ✨ Features

- **Physikalisches Fahrzeugmodell**:
  - Implementierung des **Intelligent Driver Model (IDM)** für realistisches Beschleunigungs-, Brems- und Kolonnenverhalten.
  - Exakte Trennung von physikalischen Einheiten (m, m/s, m/s²) und Canvas-Rendering (5 px/m).
- **Vielfältige Verkehrsszenarien**:
  - **Phantomstau (Hidden Chicken)**: Veranschaulicht, wie eine kurzzeitige Bremsung oder ein plötzliches Hindernis sich wellenartig nach hinten verstärkt und Stau aus dem Nichts erzeugt.
  - **Ampelsimulation (Klassisch & Vernetzt)**: Vergleich zwischen herkömmlichen Ampelphasen und vernetzter Kommunikation mit präzisem Ampel-Stoppuhr-Timer.
  - **Überholmanöver**: Mehrspuriger Verkehrsfluss mit Relativgeschwindigkeitsanalyse, Sicherheitsabstandsprüfung (`isSafeToChangeLane`), aktiven Blinkern und Rückscher-Logik.
- **Interaktive Steuerung**:
  - Klickbare Ampel und Fahrzeuge auf dem Canvas.
  - Schieberegler für Fahrzeuganzahl (1 bis 20 Autos) und Simulationsgeschwindigkeit.
  - Umschaltbare Timer-Stoppmodi (*Alle Autos drüber* vs. *Bei manuellem Rot*).
- **Progressive Web App (PWA)**:
  - Service Worker mit Cache-Strategie (Network-First) für Offline-Verfügbarkeit.
  - Installierbar als App auf Desktop, Tablet und Smartphone.
- **Modernes, responsives Design**:
  - Edge-to-Edge Canvas-Darstellung mit `viewport-fit=cover`.
  - Ausklappbare Seitenleiste und Changelog-Modal.
  - 100 % SVG-Vektorgrafiken für scharfe Darstellung auf allen DPI-Stufen.

---

## 🚀 Schnelleinstieg

Da die Anwendung rein clientseitig (Vanilla HTML, CSS, JavaScript) aufgebaut ist, sind keine Node-Build-Schritte zwingend erforderlich.

### 1. Repository klonen

```bash
git clone https://github.com/mrgoldsmitt/verkehrssimulation.git
cd verkehrssimulation
```

### 2. Lokal starten

Starte einen beliebigen lokalen Webserver (damit der Service Worker geladen werden kann):

**Mit Python:**
```bash
python3 -m http.server 8000
```

**Mit Node.js:**
```bash
npx serve .
```

Öffne anschließend [http://localhost:8000](http://localhost:8000) im Browser.

---

## 🛠️ Release & Deployment

Zum Erstellen eines neuen Releases, Deployment zu Cloudflare und Veröffentlichung auf GitHub kann das Skript `deploy_release.sh` verwendet werden:

```bash
chmod +x deploy_release.sh

# Nur Offline-Paket bauen
./deploy_release.sh --build-only

# Zu Cloudflare Workers deployen
./deploy_release.sh --cf-deploy

# Kompletten Release-Zyklus durchführen (Build, Cloudflare & GitHub Release)
./deploy_release.sh --all
```

---

## 📄 Lizenz & Autor

Entwickelt von [mrgoldsmitt](https://mrgoldsmitt.work).  
Lizenziert unter der [MIT License](LICENSE).
