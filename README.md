# Beleg-Verwaltung

PWA zum Fotografieren von Rechnungen/Quittungen. Claude (Vision) erkennt die Felder
(Produkt, Kategorie, Kaufdatum, Kaufort, Preis, Garantie bis), das Foto landet in einem
eigenen Ordner "Belege" in deinem Google Drive, die Metadaten in Firebase Realtime
Database. Die Liste trennt automatisch aktive Garantien von abgelaufenen (Archiv).

Der komplette App-Code ist fertig. Was du noch **manuell** erledigen musst (Konten/Cloud-Setup
lässt sich nicht per Code automatisieren):

## 1. GitHub-Repo

1. Neues Repo z.B. `beleg-verwaltung` anlegen, diesen Ordner hochladen.
2. Repo-Einstellungen -> Pages -> Branch `main`, Ordner `/ (root)` -> Save.
3. Die App ist danach unter `https://<username>.github.io/beleg-verwaltung/` erreichbar.

## 2. Firebase-Projekt

1. [console.firebase.google.com](https://console.firebase.google.com) -> neues Projekt.
2. **Realtime Database** aktivieren, Region `europe-west1`, Startmodus "locked" (Regeln kommen unten rein).
3. **Authentication** -> Sign-in-Methode -> **Google** aktivieren.
4. Projekteinstellungen -> "Deine Apps" -> Web-App hinzufügen -> die Config-Werte in
   [firebase-config.js](firebase-config.js) eintragen (`apiKey`, `authDomain`, `databaseURL`, ...).

## 3. Google Drive OAuth-Scope

Der Code fordert beim Google-Login bereits automatisch den Scope
`https://www.googleapis.com/auth/drive.file` an (siehe [app.js](app.js)) — das erlaubt der App
nur Zugriff auf Dateien, die sie selbst erstellt (eigener "Belege"-Ordner), nicht auf dein
restliches Drive. Damit das funktioniert:

1. Google Cloud Console (selbes Projekt wie Firebase) -> **APIs & Services** -> Library ->
   **Google Drive API** aktivieren.
2. **APIs & Services** -> **OAuth consent screen**: External, Publishing status "Testing" reicht
   für den Eigengebrauch. Unter "Test users" deine eigene Google-Mail-Adresse eintragen — sonst
   verweigert Google den Login mit dem Drive-Scope.

Der von Google zurückgegebene Zugriffstoken ist ca. 1 Stunde gültig. Falls der Upload mit
"Kein Drive-Zugriff" fehlschlägt, im Header auf **Drive verbinden** klicken, um ihn zu erneuern.

## 4. Datenbank-Regeln deployen

Regeln liegen in [database.rules.json](database.rules.json) — jeder Nutzer sieht nur seine
eigenen Belege (`receipts/<eigene-uid>/...`).

```bash
npm install -g firebase-tools
firebase login
firebase use --add   # dein Firebase-Projekt auswählen
firebase deploy --only database
```

## 5. Cloud Function für die KI-Erkennung deployen

Der Anthropic-API-Key darf nicht im Frontend stehen, deshalb läuft die Anfrage über eine
Firebase Cloud Function ([functions/index.js](functions/index.js)).

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
# Key aus console.anthropic.com/settings/keys einfügen wenn danach gefragt

cd functions
npm install
cd ..
firebase deploy --only functions
```

## 6. Testen & auf GitHub Pages veröffentlichen

Lokal testen (Firebase-Login/Firestore funktioniert auch über `http://localhost`, wenn du den
Ordner z.B. mit `npx serve .` startest). Danach den Ordner in dein GitHub-Repo pushen — Pages
baut automatisch.

Icon: [icons/icon.svg](icons/icon.svg) ist ein einfacher Platzhalter (SVG reicht für moderne
Browser als PWA-Icon). Wenn du ein eigenes Icon willst, ersetze die Datei oder ergänze PNG-Größen
(192x192, 512x512) im [manifest.json](manifest.json).

## Datenmodell

```
receipts/
  <uid>/
    <pushId>/
      product, category, purchaseDate, purchaseLocation, price,
      warrantyUntil, physicalLocation, notes,
      driveFileId, driveFileLink,
      createdAt, updatedAt
```

Status aktiv/archiviert wird nicht gespeichert, sondern beim Anzeigen live aus
`warrantyUntil` vs. heutigem Datum berechnet.
