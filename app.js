import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  push,
  update,
  remove,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js";
import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);
const functions = getFunctions(firebaseApp, "europe-west1");

const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/drive.file");

// --- DOM refs ---
const signInBtn = document.getElementById("signInBtn");
const signOutBtn = document.getElementById("signOutBtn");
const connectDriveBtn = document.getElementById("connectDriveBtn");
const userArea = document.getElementById("userArea");
const userEmailEl = document.getElementById("userEmail");
const appEl = document.getElementById("app");
const signedOutHint = document.getElementById("signedOutHint");

const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const recognizeBtn = document.getElementById("recognizeBtn");
const statusEl = document.getElementById("status");
const entryForm = document.getElementById("entryForm");
const cancelEditBtn = document.getElementById("cancelEditBtn");

const searchInput = document.getElementById("searchInput");
const activeListEl = document.getElementById("activeList");
const archivedListEl = document.getElementById("archivedList");

// --- State ---
let currentUser = null;
let driveAccessToken = null;
let driveFolderId = localStorage.getItem("driveFolderId") || null;
let selectedFile = null;
let editingId = null;
let allReceipts = [];
let unsubscribeReceipts = null;

function setStatus(msg) {
  statusEl.textContent = msg;
}

// --- Auth ---
// signInWithRedirect statt signInWithPopup: Popups werden von vielen mobilen
// Browsern und PWA-Standalone-Fenstern blockiert, Weiterleitung funktioniert überall.
signInBtn.addEventListener("click", () => {
  signInWithRedirect(auth, provider).catch((err) => {
    setStatus("Anmeldung fehlgeschlagen: " + err.message);
  });
});

connectDriveBtn.addEventListener("click", () => {
  signInWithRedirect(auth, provider).catch((err) => {
    setStatus("Drive-Verbindung fehlgeschlagen: " + err.message);
  });
});

getRedirectResult(auth)
  .then((result) => {
    if (!result) return;
    const credential = GoogleAuthProvider.credentialFromResult(result);
    driveAccessToken = credential?.accessToken ?? null;
    if (driveAccessToken) setStatus("Drive verbunden.");
  })
  .catch((err) => {
    setStatus("Anmeldung fehlgeschlagen: " + err.message);
  });

signOutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    userArea.hidden = false;
    signInBtn.hidden = true;
    userEmailEl.textContent = user.email ?? "";
    appEl.hidden = false;
    signedOutHint.hidden = true;
    subscribeReceipts(user.uid);
  } else {
    userArea.hidden = true;
    signInBtn.hidden = false;
    appEl.hidden = true;
    signedOutHint.hidden = false;
    if (unsubscribeReceipts) unsubscribeReceipts();
    allReceipts = [];
  }
});

// --- File selection / preview ---
fileInput.addEventListener("change", () => {
  selectedFile = fileInput.files[0] ?? null;
  if (selectedFile) {
    preview.src = URL.createObjectURL(selectedFile);
    preview.hidden = false;
    recognizeBtn.disabled = false;
  } else {
    preview.hidden = true;
    recognizeBtn.disabled = true;
  }
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// --- KI-Erkennung ---
recognizeBtn.addEventListener("click", async () => {
  if (!selectedFile) return;
  recognizeBtn.disabled = true;
  setStatus("KI erkennt den Beleg...");
  try {
    const imageBase64 = await fileToBase64(selectedFile);
    const recognizeReceipt = httpsCallable(functions, "recognizeReceipt");
    const result = await recognizeReceipt({ imageBase64, mimeType: selectedFile.type });
    fillForm(result.data || {});
    setStatus("Felder erkannt - bitte prüfen und ergänzen.");
  } catch (err) {
    setStatus("Fehler bei KI-Erkennung: " + err.message);
  } finally {
    recognizeBtn.disabled = false;
  }
});

function fillForm(fields) {
  if (fields.product) entryForm.product.value = fields.product;
  if (fields.category) entryForm.category.value = fields.category;
  if (fields.purchaseDate) entryForm.purchaseDate.value = fields.purchaseDate;
  if (fields.purchaseLocation) entryForm.purchaseLocation.value = fields.purchaseLocation;
  if (fields.price) entryForm.price.value = fields.price;
  if (fields.warrantyUntil) entryForm.warrantyUntil.value = fields.warrantyUntil;
}

function resetForm() {
  entryForm.reset();
  selectedFile = null;
  editingId = null;
  fileInput.value = "";
  preview.hidden = true;
  recognizeBtn.disabled = true;
  cancelEditBtn.hidden = true;
}

cancelEditBtn.addEventListener("click", resetForm);

// --- Google Drive Upload ---
async function ensureDriveFolder() {
  if (driveFolderId) return driveFolderId;
  const q = encodeURIComponent(
    "name='Belege' and mimeType='application/vnd.google-apps.folder' and trashed=false"
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${driveAccessToken}` } }
  );
  if (!searchRes.ok) throw new Error("Drive-Ordnersuche fehlgeschlagen (" + searchRes.status + ")");
  const searchData = await searchRes.json();

  if (searchData.files && searchData.files.length > 0) {
    driveFolderId = searchData.files[0].id;
  } else {
    const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${driveAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Belege", mimeType: "application/vnd.google-apps.folder" }),
    });
    if (!createRes.ok) throw new Error("Drive-Ordner konnte nicht erstellt werden");
    const createData = await createRes.json();
    driveFolderId = createData.id;
  }
  localStorage.setItem("driveFolderId", driveFolderId);
  return driveFolderId;
}

async function uploadToDrive(file) {
  if (!driveAccessToken) {
    throw new Error("Kein Drive-Zugriff. Bitte zuerst 'Drive verbinden' klicken.");
  }
  const folderId = await ensureDriveFolder();
  const metadata = { name: `${Date.now()}_${file.name}`, parents: [folderId] };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", file);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${driveAccessToken}` },
      body: form,
    }
  );
  if (!res.ok) throw new Error("Drive-Upload fehlgeschlagen (" + res.status + ")");
  return res.json(); // { id, webViewLink }
}

// --- Speichern ---
entryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;
  setStatus("Speichere...");
  try {
    const entry = {
      product: entryForm.product.value.trim(),
      category: entryForm.category.value.trim(),
      purchaseDate: entryForm.purchaseDate.value || null,
      purchaseLocation: entryForm.purchaseLocation.value.trim(),
      price: entryForm.price.value ? Number(entryForm.price.value) : null,
      warrantyUntil: entryForm.warrantyUntil.value || null,
      physicalLocation: entryForm.physicalLocation.value.trim(),
      notes: entryForm.notes.value.trim(),
      updatedAt: Date.now(),
    };

    if (selectedFile) {
      const driveInfo = await uploadToDrive(selectedFile);
      entry.driveFileId = driveInfo.id;
      entry.driveFileLink = driveInfo.webViewLink;
    }

    if (editingId) {
      await update(ref(db, `receipts/${currentUser.uid}/${editingId}`), entry);
    } else {
      entry.createdAt = Date.now();
      await push(ref(db, `receipts/${currentUser.uid}`), entry);
    }
    resetForm();
    setStatus("Gespeichert.");
  } catch (err) {
    setStatus("Fehler beim Speichern: " + err.message);
  }
});

// --- Liste / Suche ---
function subscribeReceipts(uid) {
  const receiptsRef = ref(db, `receipts/${uid}`);
  unsubscribeReceipts = onValue(receiptsRef, (snapshot) => {
    const val = snapshot.val() || {};
    allReceipts = Object.entries(val).map(([id, data]) => ({ id, ...data }));
    renderList();
  });
}

searchInput.addEventListener("input", renderList);

function daysUntil(dateStr) {
  const diffMs = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderItem(r) {
  const daysLeft = r.warrantyUntil ? daysUntil(r.warrantyUntil) : null;
  return `
    <div class="card" data-id="${r.id}">
      <div class="card-header">
        <strong>${escapeHtml(r.product || "Unbenannt")}</strong>
        ${r.category ? `<span class="tag">${escapeHtml(r.category)}</span>` : ""}
      </div>
      <div class="card-body">
        <div>Kauf: ${r.purchaseDate || "-"} bei ${escapeHtml(r.purchaseLocation || "-")}</div>
        <div>Preis: ${r.price != null ? r.price + " CHF" : "-"}</div>
        <div>Garantie bis: ${r.warrantyUntil || "-"}${daysLeft != null ? ` (${daysLeft} Tage)` : ""}</div>
        <div>Ablage: ${escapeHtml(r.physicalLocation || "-")}</div>
        ${r.driveFileLink ? `<a href="${r.driveFileLink}" target="_blank" rel="noopener">Beleg ansehen</a>` : ""}
      </div>
      <div class="card-actions">
        <button type="button" data-action="edit" data-id="${r.id}">Bearbeiten</button>
        <button type="button" data-action="delete" data-id="${r.id}">Löschen</button>
      </div>
    </div>`;
}

function renderList() {
  const term = searchInput.value.trim().toLowerCase();
  const today = new Date().toISOString().slice(0, 10);

  const filtered = allReceipts.filter((r) => {
    if (!term) return true;
    return [r.product, r.purchaseLocation, r.physicalLocation, r.category]
      .filter(Boolean)
      .some((v) => v.toLowerCase().includes(term));
  });

  const active = filtered
    .filter((r) => !r.warrantyUntil || r.warrantyUntil >= today)
    .sort((a, b) => (a.warrantyUntil || "9999-99-99").localeCompare(b.warrantyUntil || "9999-99-99"));

  const archived = filtered
    .filter((r) => r.warrantyUntil && r.warrantyUntil < today)
    .sort((a, b) => (b.warrantyUntil || "").localeCompare(a.warrantyUntil || ""));

  activeListEl.innerHTML = active.map(renderItem).join("") || "<p class='empty'>Keine aktiven Belege.</p>";
  archivedListEl.innerHTML = archived.map(renderItem).join("") || "<p class='empty'>Kein Archiv.</p>";
}

for (const listEl of [activeListEl, archivedListEl]) {
  listEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn || !currentUser) return;
    const id = btn.dataset.id;
    const receipt = allReceipts.find((r) => r.id === id);
    if (!receipt) return;

    if (btn.dataset.action === "edit") {
      editingId = id;
      entryForm.product.value = receipt.product || "";
      entryForm.category.value = receipt.category || "";
      entryForm.purchaseDate.value = receipt.purchaseDate || "";
      entryForm.purchaseLocation.value = receipt.purchaseLocation || "";
      entryForm.price.value = receipt.price ?? "";
      entryForm.warrantyUntil.value = receipt.warrantyUntil || "";
      entryForm.physicalLocation.value = receipt.physicalLocation || "";
      entryForm.notes.value = receipt.notes || "";
      cancelEditBtn.hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (btn.dataset.action === "delete") {
      if (confirm(`"${receipt.product}" wirklich löschen? (Datei in Google Drive bleibt erhalten)`)) {
        await remove(ref(db, `receipts/${currentUser.uid}/${id}`));
      }
    }
  });
}

// --- PWA Service Worker ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
