const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

const EXTRACTION_PROMPT = `Du bekommst das Foto einer Rechnung oder Quittung. Extrahiere folgende Felder und antworte NUR mit einem JSON-Objekt, ohne Erklärung, ohne Markdown-Codeblock:
{
  "product": "Produktname (das gekaufte Hauptprodukt)",
  "category": "Kategorie, z.B. Elektronik, Möbel, Haushalt, Kleidung, Sonstiges",
  "purchaseDate": "Kaufdatum als YYYY-MM-DD, oder null wenn nicht erkennbar",
  "purchaseLocation": "Geschäft/Händler/Online-Shop",
  "price": "Gesamtbetrag als Zahl ohne Währungssymbol, oder null",
  "warrantyUntil": "Geschätztes Garantie-Enddatum als YYYY-MM-DD. Falls auf dem Beleg eine Garantiedauer steht, nutze diese ab Kaufdatum. Sonst nimm 24 Monate gesetzliche Gewährleistung als Schätzung an. Falls Kaufdatum unbekannt ist, setze null."
}`;

exports.recognizeReceipt = onCall({ secrets: [anthropicApiKey], region: "europe-west1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Bitte anmelden.");
  }

  const { imageBase64, mimeType } = request.data || {};
  if (!imageBase64 || !mimeType) {
    throw new HttpsError("invalid-argument", "imageBase64 und mimeType sind erforderlich.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicApiKey.value(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: EXTRACTION_PROMPT },
            { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new HttpsError("internal", `Claude API Fehler (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text ?? "";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch {
    throw new HttpsError("internal", "Konnte KI-Antwort nicht als JSON lesen: " + text.slice(0, 200));
  }
});
