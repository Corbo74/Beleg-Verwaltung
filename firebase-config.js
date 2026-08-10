// Werte aus: Firebase Console -> Projekteinstellungen -> "Deine Apps" -> Web-App (</>)
// Diese Datei darf öffentlich sein (Web-Config ist kein Geheimnis) -
// die eigentliche Sicherheit kommt über die Realtime-Database-Regeln + Anmeldepflicht.
export const firebaseConfig = {
  apiKey: "AIzaSyAw-6QEHBHLfUVWcjgwgLrJ8c4_IGzT2N8",
  authDomain: "beleg-verwaltung.firebaseapp.com",
  // TODO bestätigen: sobald du Realtime Database angelegt hast, zeigt dir die Firebase Console
  // (Realtime Database -> oben auf der Seite) die echte URL. Passe sie hier an, falls abweichend.
  databaseURL: "https://beleg-verwaltung-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "beleg-verwaltung",
  storageBucket: "beleg-verwaltung.firebasestorage.app",
  messagingSenderId: "116516976072",
  appId: "1:116516976072:web:e65133b6fbc3304a13bcfd",
};
