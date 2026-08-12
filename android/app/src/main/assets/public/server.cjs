var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
var import_dotenv = __toESM(require("dotenv"), 1);
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json({ limit: "25mb" }));
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in process.env");
  }
  return new import_genai.GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
app.post("/api/scan-fridge", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg", locationHint = "kuehlschrank" } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Kein Bild \xFCbermittelt." });
    }
    const ai = getGeminiClient();
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const prompt = `Du bist ein hochentwickelter KI-K\xFChlschrank-Scanner und Lebensmittel-Experte.
Analysiere das \xFCbermittelte Foto von Lebensmitteln (K\xFChlschrank, Vorratsschrank, Tiefk\xFChlfach oder Eink\xE4ufen/Quittung).
Identifiziere ALLE sichtbaren Lebensmittel so genau wie m\xF6glich auf Deutsch.

Achte besonders auf:
- Exakte Deutsche Bezeichnung (z.B. "Gouda Scheiben 48%", "Hafermilch Barista", "Brokkoli", "Bio-Eier").
- Kategorie (milchprodukte, gemuese_obst, fleisch_fisch, saucen_dips, getraenke, vorrat_trocken, tiefkuehl, sonstiges).
- Gesch\xE4tzte Menge und Einheit (z.B. 1 Flasche, 500g, 1 Packung, 3 St\xFCck).
- Gesch\xE4tzte Haltbarkeit in Tagen ab heute (empfohlenes MHD f\xFCr angebrochene/frische Lebensmittel).
- Frischegrad-Score von 1 bis 100.
- Hilfreiche Anmerkung (z.B. "Im Gem\xFCsefach lagern", "Bald verbrauchen", "Gute Frische").

Liefere au\xDFerdem eine kurze Gesamtzusammenfassung und 2-3 praktische Aufbewahrungstipps.`;
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType
            }
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: import_genai.Type.OBJECT,
          properties: {
            detectedItems: {
              type: import_genai.Type.ARRAY,
              description: "Liste aller erkannten Lebensmittel im Bild",
              items: {
                type: import_genai.Type.OBJECT,
                properties: {
                  name: { type: import_genai.Type.STRING, description: "Name des Lebensmittels auf Deutsch" },
                  category: {
                    type: import_genai.Type.STRING,
                    description: "Eine aus: milchprodukte, gemuese_obst, fleisch_fisch, saucen_dips, getraenke, vorrat_trocken, tiefkuehl, sonstiges"
                  },
                  storageLocation: {
                    type: import_genai.Type.STRING,
                    description: "Eine aus: kuehlschrank, gefrierfach, vorratsschrank"
                  },
                  estimatedQuantity: { type: import_genai.Type.NUMBER, description: "Menge als Zahl" },
                  unit: { type: import_genai.Type.STRING, description: "Einheit z.B. St\xFCck, g, ml, Packung, Flasche" },
                  freshnessScore: { type: import_genai.Type.NUMBER, description: "Frische-Score 1-100" },
                  estimatedDaysUntilExpiry: { type: import_genai.Type.NUMBER, description: "Haltbarkeit in Tagen" },
                  notes: { type: import_genai.Type.STRING, description: "Tipp oder Status z.B. angebrochen" }
                },
                required: ["name", "category", "storageLocation", "estimatedQuantity", "unit", "estimatedDaysUntilExpiry"]
              }
            },
            overallSummary: { type: import_genai.Type.STRING, description: "Kurze Zusammenfassung des Inhalts" },
            fridgeOrganizingTips: {
              type: import_genai.Type.ARRAY,
              items: { type: import_genai.Type.STRING },
              description: "2-3 Tipps zur optimalen Lagerung"
            }
          },
          required: ["detectedItems", "overallSummary", "fridgeOrganizingTips"]
        }
      }
    });
    const resultText = response.text || "{}";
    const data = JSON.parse(resultText);
    res.json(data);
  } catch (err) {
    console.error("Fehler beim Scannen:", err);
    res.status(500).json({ error: err.message || "Fehler beim Analysieren des Fotos." });
  }
});
app.post("/api/generate-recipes", async (req, res) => {
  try {
    const { availableItems = [], dietaryFilters = [], maxPrepTimeMinutes = 45 } = req.body;
    if (!Array.isArray(availableItems) || availableItems.length === 0) {
      return res.status(400).json({ error: "Keine verf\xFCgbaren Zutaten \xFCbermittelt." });
    }
    const ai = getGeminiClient();
    const itemsFormatted = availableItems.map(
      (it) => `- ${it.name} (${it.quantity || 1} ${it.unit || "St\xFCck"}), l\xE4uft in ${it.daysUntilExpiry ?? 3} Tagen ab, Kategorie: ${it.category || "Sonstiges"}`
    ).join("\n");
    const filtersText = dietaryFilters.length > 0 ? `Erforderliche Di\xE4t/Pr\xE4ferenzen: ${dietaryFilters.join(", ")}.` : "";
    const prompt = `Du bist ein professioneller Chefkoch & Food-Waste-Experte.
Generiere 3 kreative, schmackhafte Rezepte auf Deutsch, die m\xF6glichst viele der folgenden vorhandenen Zutaten verbrauchen, besonders diejenigen, die bald ablaufen!

Verf\xFCgbare Zutaten im K\xFChlschrank/Vorrat:
${itemsFormatted}

${filtersText}
Maximale Zubereitungszeit: ${maxPrepTimeMinutes} Minuten.

Generiere f\xFCr jedes Rezept eine detaillierte Anleitung, Mengenangaben (welche Zutaten aus dem K\xFChlschrank genutzt werden und welche evtl. fehlen/gekauft werden m\xFCssen), N\xE4hrwerte, Zubereitungszeit und einen Food-Waste-Tipp.`;
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: import_genai.Type.ARRAY,
          items: {
            type: import_genai.Type.OBJECT,
            properties: {
              id: { type: import_genai.Type.STRING },
              title: { type: import_genai.Type.STRING, description: "Titel des Rezepts" },
              description: { type: import_genai.Type.STRING, description: "Appetitliche Kurzbeschreibung" },
              prepTimeMinutes: { type: import_genai.Type.NUMBER, description: "Zubereitungszeit in Minuten" },
              difficulty: { type: import_genai.Type.STRING, description: "Einfach, Mittel oder Schwer" },
              servings: { type: import_genai.Type.NUMBER, description: "Anzahl Portionen" },
              usedIngredients: {
                type: import_genai.Type.ARRAY,
                items: {
                  type: import_genai.Type.OBJECT,
                  properties: {
                    name: { type: import_genai.Type.STRING },
                    quantity: { type: import_genai.Type.STRING },
                    isFromFridge: { type: import_genai.Type.BOOLEAN }
                  },
                  required: ["name", "quantity", "isFromFridge"]
                }
              },
              missingIngredients: {
                type: import_genai.Type.ARRAY,
                items: {
                  type: import_genai.Type.OBJECT,
                  properties: {
                    name: { type: import_genai.Type.STRING },
                    quantity: { type: import_genai.Type.STRING }
                  },
                  required: ["name", "quantity"]
                }
              },
              steps: {
                type: import_genai.Type.ARRAY,
                items: { type: import_genai.Type.STRING },
                description: "Schritt-f\xFCr-Schritt Zubereitung"
              },
              caloriesPerServing: { type: import_genai.Type.NUMBER, description: "Kalorien pro Portion" },
              proteinGrams: { type: import_genai.Type.NUMBER },
              carbsGrams: { type: import_genai.Type.NUMBER },
              fatGrams: { type: import_genai.Type.NUMBER },
              wastePreventionTip: { type: import_genai.Type.STRING, description: "Warum dieses Rezept Verschwendung vermeidet" }
            },
            required: [
              "title",
              "description",
              "prepTimeMinutes",
              "difficulty",
              "usedIngredients",
              "steps",
              "wastePreventionTip"
            ]
          }
        }
      }
    });
    const resultText = response.text || "[]";
    const data = JSON.parse(resultText);
    res.json(data);
  } catch (err) {
    console.error("Fehler bei Rezeptgenerierung:", err);
    res.status(500).json({ error: err.message || "Fehler beim Generieren der Rezepte." });
  }
});
app.post("/api/ai-chef", async (req, res) => {
  try {
    const { message, history = [], inventoryContext = [] } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Keine Nachricht \xFCbermittelt." });
    }
    const ai = getGeminiClient();
    const inventorySummary = Array.isArray(inventoryContext) && inventoryContext.length > 0 ? `Aktueller K\xFChlschrankinhalt des Nutzers:
` + inventoryContext.map((i) => `- ${i.name} (${i.quantity} ${i.unit}, l\xE4uft in ${i.daysUntilExpiry ?? "?"} Tagen ab)`).join("\n") : "K\xFChlschrankinhalt ist aktuell leer oder unbekannt.";
    const systemInstruction = `Du bist "Chef Scan AI", ein freundlicher, kompetenter K\xFCchenassistent und Lebensmittel-Retter.
Du antwortest pr\xE4zise, sympathisch und praxisnah auf Deutsch.
Du kennst den aktuellen K\xFChlschrank- und Vorratsbestand des Nutzers und kannst direkt darauf eingehen.
Gib Tipps zur optimalen Lagerung, Haltbarkeit, Rezeptanpassungen, Ersatzzutaten und cleverer Verwertung.

${inventorySummary}`;
    const chat = ai.chats.create({
      model: "gemini-3.6-flash",
      config: {
        systemInstruction
      }
    });
    const response = await chat.sendMessage({ message });
    res.json({ text: response.text });
  } catch (err) {
    console.error("Fehler im AI Chef Chat:", err);
    res.status(500).json({ error: err.message || "Fehler bei der KI-Antwort." });
  }
});
app.post("/api/barcode-lookup", async (req, res) => {
  try {
    const { barcode } = req.body;
    if (!barcode) {
      return res.status(400).json({ error: "Kein Barcode angegeben." });
    }
    const rawDigits = barcode.toString().replace(/\D/g, "").trim();
    if (!rawDigits) {
      return res.status(400).json({ error: "Ung\xFCltiges Barcode-Format." });
    }
    const candidates = [rawDigits];
    if (rawDigits.length < 13) {
      candidates.push(rawDigits.padStart(13, "0"));
    }
    for (const code of candidates) {
      const urls = [
        `https://de.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`,
        `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`,
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`
      ];
      for (const offUrl of urls) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8e3);
          const offResponse = await fetch(offUrl, {
            headers: {
              "User-Agent": "KuehlschrankScan/1.0 (Mobile App; contact: support@kuehlschrank.app)"
            },
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (offResponse.ok) {
            const offData = await offResponse.json();
            const product = offData.product || (offData.status === 1 ? offData.product : null);
            if (product) {
              const p = product;
              const brand = (p.brands || p.brand_owner || p.brands_tags?.[0] || "").split(",")[0].trim();
              const nameRaw = p.product_name_de || p.product_name || p.generic_name_de || p.generic_name || p.abbreviated_product_name_de || p.product_name_en || "";
              if (nameRaw) {
                const fullName = brand && !nameRaw.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${nameRaw}` : nameRaw;
                const imageUrl = p.image_front_url || p.image_front_small_url || p.image_url || "";
                const quantityStr = p.quantity || "1 St\xFCck";
                const categoriesStr = ((p.categories_tags || []).join(" ") + " " + (p.categories || "") + " " + nameRaw).toLowerCase();
                let category = "sonstiges";
                let icon = "\u{1F4E6}";
                let storageLocation = "kuehlschrank";
                let estimatedDays = 14;
                if (categoriesStr.includes("dairy") || categoriesStr.includes("milch") || categoriesStr.includes("k\xE4se") || categoriesStr.includes("joghurt") || categoriesStr.includes("butter") || categoriesStr.includes("quark") || categoriesStr.includes("sahne") || categoriesStr.includes("schmand")) {
                  category = "milchprodukte";
                  icon = "\u{1F9C0}";
                  storageLocation = "kuehlschrank";
                  estimatedDays = 10;
                } else if (categoriesStr.includes("beverage") || categoriesStr.includes("getr\xE4nk") || categoriesStr.includes("saft") || categoriesStr.includes("wasser") || categoriesStr.includes("soda") || categoriesStr.includes("bier") || categoriesStr.includes("wein") || categoriesStr.match(/\\bcola\\b/)) {
                  category = "getraenke";
                  icon = "\u{1F9C3}";
                  storageLocation = "kuehlschrank";
                  estimatedDays = 30;
                } else if (categoriesStr.includes("meat") || categoriesStr.includes("fleisch") || categoriesStr.includes("fisch") || categoriesStr.includes("wurst") || categoriesStr.includes("seafood") || categoriesStr.includes("salami") || categoriesStr.includes("schinken")) {
                  category = "fleisch_fisch";
                  icon = "\u{1F969}";
                  storageLocation = "kuehlschrank";
                  estimatedDays = 5;
                } else if (categoriesStr.includes("vegetable") || categoriesStr.includes("gem\xFCse") || categoriesStr.includes("fruit") || categoriesStr.includes("obst") || categoriesStr.includes("salat") || categoriesStr.includes("apfel") || categoriesStr.includes("tomate")) {
                  category = "gemuese_obst";
                  icon = "\u{1F966}";
                  storageLocation = "kuehlschrank";
                  estimatedDays = 7;
                } else if (categoriesStr.includes("frozen") || categoriesStr.includes("tiefk\xFChl") || categoriesStr.includes("eis") || categoriesStr.includes("pizza")) {
                  category = "tiefkuehl";
                  icon = "\u{1F9CA}";
                  storageLocation = "gefrierfach";
                  estimatedDays = 90;
                } else if (categoriesStr.includes("snack") || categoriesStr.includes("biscuit") || categoriesStr.includes("s\xFC\xDF") || categoriesStr.includes("schokolade") || categoriesStr.includes("pasta") || categoriesStr.includes("reis") || categoriesStr.includes("konserve") || categoriesStr.includes("brot") || categoriesStr.includes("m\xFCsli") || categoriesStr.includes("nugat") || categoriesStr.includes("nuss") || categoriesStr.includes("aufstrich")) {
                  category = "vorrat_trocken";
                  icon = "\u{1F35E}";
                  storageLocation = "vorratsschrank";
                  estimatedDays = 180;
                } else if (categoriesStr.includes("sauce") || categoriesStr.includes("dip") || categoriesStr.includes("ketchup") || categoriesStr.includes("senf") || categoriesStr.includes("mayo")) {
                  category = "saucen_dips";
                  icon = "\u{1F96B}";
                  storageLocation = "kuehlschrank";
                  estimatedDays = 60;
                }
                return res.json({
                  name: fullName,
                  category,
                  categoryIcon: icon,
                  storageLocation,
                  estimatedQuantity: 1,
                  unit: quantityStr,
                  estimatedDaysUntilExpiry: estimatedDays,
                  brand,
                  imageUrl,
                  source: "Open Food Facts",
                  barcode: rawDigits
                });
              }
            }
          }
        } catch (offErr) {
          console.warn(`OFF Fetch Fehler f\xFCr ${offUrl}:`, offErr);
        }
      }
    }
    try {
      const ai = getGeminiClient();
      const prompt = `Ein Lebensmittelprodukt wurde mit dem Barcode / EAN "${rawDigits}" gescannt. 
Identifiziere wenn m\xF6glich das deutsche Markenprodukt (z.B. Haribo, Toffifee, Nutella, Weihenstephan Milch, Barilla Pasta, Coca Cola) oder sch\xE4tze anhand des EAN-Barcodes ab, um welches konkrete Lebensmittel im deutschen Supermarkt es sich handelt.
Gib sinnvolle, genaue Werte f\xFCr Name, Marke, Kategorie (milchprodukte, gemuese_obst, fleisch_fisch, saucen_dips, getraenke, vorrat_trocken, tiefkuehl, sonstiges), passendes Emoji Icon (z.B. \u{1F9C0}, \u{1F966}, \u{1F969}, \u{1F96B}, \u{1F9C3}, \u{1F35E}, \u{1F9CA}, \u{1F4E6}), Lagerort, Menge und empfohlene Haltbarkeit in Tagen zur\xFCck.`;
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: import_genai.Type.OBJECT,
            properties: {
              name: { type: import_genai.Type.STRING },
              brand: { type: import_genai.Type.STRING },
              category: { type: import_genai.Type.STRING },
              categoryIcon: { type: import_genai.Type.STRING },
              storageLocation: { type: import_genai.Type.STRING },
              estimatedQuantity: { type: import_genai.Type.NUMBER },
              unit: { type: import_genai.Type.STRING },
              estimatedDaysUntilExpiry: { type: import_genai.Type.NUMBER }
            },
            required: ["name", "category", "categoryIcon", "storageLocation", "estimatedQuantity", "unit", "estimatedDaysUntilExpiry"]
          }
        }
      });
      const data = JSON.parse(response.text || "{}");
      return res.json({
        name: data.name || `Artikel (${rawDigits})`,
        brand: data.brand || "",
        category: data.category || "sonstiges",
        categoryIcon: data.categoryIcon || "\u{1F4E6}",
        storageLocation: data.storageLocation || "kuehlschrank",
        estimatedQuantity: data.estimatedQuantity || 1,
        unit: data.unit || "St\xFCck",
        estimatedDaysUntilExpiry: data.estimatedDaysUntilExpiry || 14,
        source: "Automatische Erfassung",
        barcode: rawDigits
      });
    } catch (aiErr) {
      console.warn("Auto Barcode Erkennung fehlgeschlagen:", aiErr);
      return res.json({
        name: `Gescanntes Produkt (${rawDigits})`,
        category: "sonstiges",
        categoryIcon: "\u{1F4E6}",
        storageLocation: "kuehlschrank",
        estimatedQuantity: 1,
        unit: "St\xFCck",
        estimatedDaysUntilExpiry: 14,
        brand: "",
        source: "Barcode Erfassung",
        barcode: rawDigits
      });
    }
  } catch (err) {
    console.error("Barcode Lookup Fehler:", err);
    return res.json({
      name: `Gescanntes Produkt`,
      category: "sonstiges",
      categoryIcon: "\u{1F4E6}",
      storageLocation: "kuehlschrank",
      estimatedQuantity: 1,
      unit: "St\xFCck",
      estimatedDaysUntilExpiry: 14,
      source: "Lokal",
      barcode: req.body?.barcode || ""
    });
  }
});
app.post("/api/scan-mhd", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg" } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Kein Bild \xFCbermittelt." });
    }
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    try {
      const ai = getGeminiClient();
      const prompt = `Du bist ein hochpr\xE4ziser OCR-Scanner f\xFCr Mindesthaltbarkeitsdaten (MHD / Exp. Date / Best Before) auf Lebensmittelverpackungen.
Analysiere dieses Bild vom Aufdruck auf der Lebensmittelverpackung.

WICHTIGE ANWEISUNG F\xDCR DOT-MATRIX & LASERGRAVUREN:
Rekonstruiere Dot-Matrix-Druck, Inkjet-Spr\xFChdots, Punktdruck und unterbrochene Lasergravur-Striche mental zu Ziffern 0-9 und Trennzeichen (z.B. '.', '/', '-').
Achte besonders auf schwer lesbare oder unterbrochene Punktdruck-Muster wie '8' vs '3' vs '0', '1' vs 'I', oder helle Gravuren auf dunklem Plastik.

Suche nach Datumseingaben wie z.B.:
- "MHD: 24.11.2026" oder "24.11.26" oder "24/11/26" oder "241126"
- "EXP 15.08.25" oder "BEST BEFORE 12.09.2026"
- "mindestens haltbar bis: 05.10.26"

Aufgabe:
1. Extrahiere das gegebene MHD im Format YYYY-MM-DD (z.B. 2026-11-24). Falls nur Monat/Jahr steht (z.B. 11/26), w\xE4hle den letzten Tag des Monats (z.B. 2026-11-30).
2. Gib die gesch\xE4tzten verbleibenden Tage ab heute (aktuelles Jahr 2026) an.
3. Gib den im Bild erkannten Rohtext an.
4. Falls das Punktmuster mehrdeutig ist, gib alternative Lesarten in 'alternativeReadings' an (z.B. ["2026-11-24", "2028-11-24"]).`;
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: {
          parts: [
            {
              inlineData: {
                data: cleanBase64,
                mimeType
              }
            },
            { text: prompt }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: import_genai.Type.OBJECT,
            properties: {
              detectedDateIso: { type: import_genai.Type.STRING, description: "Gefundenes Datum im Format YYYY-MM-DD" },
              rawText: { type: import_genai.Type.STRING, description: "Erkannter Aufdruck-Text z.B. MHD 12.10.26" },
              confidence: { type: import_genai.Type.NUMBER, description: "Sicherheit 1-100" },
              alternativeReadings: {
                type: import_genai.Type.ARRAY,
                items: { type: import_genai.Type.STRING },
                description: "Alternative Auslegungen bei mehrdeutigem Punktdruck"
              }
            },
            required: ["detectedDateIso", "rawText", "confidence"]
          }
        }
      });
      const resultText = response.text || "{}";
      const data = JSON.parse(resultText);
      return res.json(data);
    } catch (aiErr) {
      console.warn("MHD OCR Scan AI Fehler:", aiErr);
      const fallbackDate = new Date(Date.now() + 14 * 864e5).toISOString().split("T")[0];
      return res.json({
        detectedDateIso: fallbackDate,
        rawText: "Standard MHD (+14 Tage)",
        confidence: 50
      });
    }
  } catch (err) {
    console.error("MHD Scan Fehler:", err);
    const fallbackDate = new Date(Date.now() + 14 * 864e5).toISOString().split("T")[0];
    return res.json({
      detectedDateIso: fallbackDate,
      rawText: "Manuelles Datum vorausgew\xE4hlt",
      confidence: 30
    });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[K\xFChlschrank Scan AI] Server gestartet auf http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
