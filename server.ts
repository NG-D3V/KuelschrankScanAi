import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Body parser with 25mb limit for base64 camera image uploads
app.use(express.json({ limit: "25mb" }));

// Helper to get Gemini client lazily
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in process.env");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Helper with retry and fallback model (gemini-3.6-flash -> gemini-2.5-flash) for high demand / 503 errors
async function generateGeminiContentWithFallback(ai: ReturnType<typeof getGeminiClient>, options: {
  contents: any;
  config?: any;
}) {
  const models = ["gemini-3.6-flash", "gemini-2.5-flash"];
  let lastError: any = null;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: options.contents,
          config: options.config,
        });
        return response;
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        console.warn(`[Gemini API] Call failed (Model: ${model}, Attempt: ${attempt + 1}):`, errMsg);
        if (attempt === 0 && (errMsg.includes("503") || errMsg.includes("high demand") || errMsg.includes("429") || errMsg.includes("UNAVAILABLE"))) {
          await new Promise((r) => setTimeout(r, 400));
        } else {
          break;
        }
      }
    }
  }

  throw lastError;
}

// 1. Scan Fridge / Food Photo Route
app.post("/api/scan-fridge", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg", locationHint = "kuehlschrank" } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "Kein Bild übermittelt." });
    }

    const ai = getGeminiClient();

    // Clean base64 string if data URL prefix exists
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const prompt = `Du bist ein hochentwickelter KI-Kühlschrank-Scanner und Lebensmittel-Experte.
Analysiere das übermittelte Foto von Lebensmitteln (Kühlschrank, Vorratsschrank, Tiefkühlfach oder Einkäufen/Quittung).
Identifiziere ALLE sichtbaren Lebensmittel so genau wie möglich auf Deutsch.

Achte besonders auf:
- Exakte Deutsche Bezeichnung (z.B. "Gouda Scheiben 48%", "Hafermilch Barista", "Brokkoli", "Bio-Eier").
- Kategorie (milchprodukte, gemuese_obst, fleisch_fisch, saucen_dips, getraenke, vorrat_trocken, tiefkuehl, sonstiges).
- Geschätzte Menge und Einheit (z.B. 1 Flasche, 500g, 1 Packung, 3 Stück).
- Geschätzte Haltbarkeit in Tagen ab heute (empfohlenes MHD für angebrochene/frische Lebensmittel).
- Frischegrad-Score von 1 bis 100.
- Hilfreiche Anmerkung (z.B. "Im Gemüsefach lagern", "Bald verbrauchen", "Gute Frische").

Liefere außerdem eine kurze Gesamtzusammenfassung und 2-3 praktische Aufbewahrungstipps.`;

    const response = await generateGeminiContentWithFallback(ai, {
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: mimeType,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedItems: {
              type: Type.ARRAY,
              description: "Liste aller erkannten Lebensmittel im Bild",
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Name des Lebensmittels auf Deutsch" },
                  category: {
                    type: Type.STRING,
                    description: "Eine aus: milchprodukte, gemuese_obst, fleisch_fisch, saucen_dips, getraenke, vorrat_trocken, tiefkuehl, sonstiges",
                  },
                  storageLocation: {
                    type: Type.STRING,
                    description: "Eine aus: kuehlschrank, gefrierfach, vorratsschrank",
                  },
                  estimatedQuantity: { type: Type.NUMBER, description: "Menge als Zahl" },
                  unit: { type: Type.STRING, description: "Einheit z.B. Stück, g, ml, Packung, Flasche" },
                  freshnessScore: { type: Type.NUMBER, description: "Frische-Score 1-100" },
                  estimatedDaysUntilExpiry: { type: Type.NUMBER, description: "Haltbarkeit in Tagen" },
                  notes: { type: Type.STRING, description: "Tipp oder Status z.B. angebrochen" },
                },
                required: ["name", "category", "storageLocation", "estimatedQuantity", "unit", "estimatedDaysUntilExpiry"],
              },
            },
            overallSummary: { type: Type.STRING, description: "Kurze Zusammenfassung des Inhalts" },
            fridgeOrganizingTips: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "2-3 Tipps zur optimalen Lagerung",
            },
          },
          required: ["detectedItems", "overallSummary", "fridgeOrganizingTips"],
        },
      },
    });

    const resultText = response.text || "{}";
    const data = JSON.parse(resultText);
    res.json(data);
  } catch (err: any) {
    console.error("Fehler beim Scannen:", err);
    res.status(500).json({ error: err.message || "Fehler beim Analysieren des Fotos." });
  }
});

// 2. Generate AI Recipes Route based on available items
app.post("/api/generate-recipes", async (req, res) => {
  try {
    const { availableItems = [], dietaryFilters = [], maxPrepTimeMinutes = 45 } = req.body;

    if (!Array.isArray(availableItems) || availableItems.length === 0) {
      return res.status(400).json({ error: "Keine verfügbaren Zutaten übermittelt." });
    }

    const ai = getGeminiClient();

    const itemsFormatted = availableItems
      .map(
        (it: any) =>
          `- ${it.name} (${it.quantity || 1} ${it.unit || "Stück"}), läuft in ${it.daysUntilExpiry ?? 3} Tagen ab, Kategorie: ${it.category || "Sonstiges"}`
      )
      .join("\n");

    const filtersText = dietaryFilters.length > 0 ? `Erforderliche Diät/Präferenzen: ${dietaryFilters.join(", ")}.` : "";

    const prompt = `Du bist ein professioneller Chefkoch & Food-Waste-Experte.
Generiere 3 kreative, schmackhafte Rezepte auf Deutsch, die möglichst viele der folgenden vorhandenen Zutaten verbrauchen, besonders diejenigen, die bald ablaufen!

Verfügbare Zutaten im Kühlschrank/Vorrat:
${itemsFormatted}

${filtersText}
Maximale Zubereitungszeit: ${maxPrepTimeMinutes} Minuten.

Generiere für jedes Rezept eine detaillierte Anleitung, Mengenangaben (welche Zutaten aus dem Kühlschrank genutzt werden und welche evtl. fehlen/gekauft werden müssen), Nährwerte, Zubereitungszeit und einen Food-Waste-Tipp.`;

    const response = await generateGeminiContentWithFallback(ai, {
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING, description: "Titel des Rezepts" },
              description: { type: Type.STRING, description: "Appetitliche Kurzbeschreibung" },
              prepTimeMinutes: { type: Type.NUMBER, description: "Zubereitungszeit in Minuten" },
              difficulty: { type: Type.STRING, description: "Einfach, Mittel oder Schwer" },
              servings: { type: Type.NUMBER, description: "Anzahl Portionen" },
              usedIngredients: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    quantity: { type: Type.STRING },
                    isFromFridge: { type: Type.BOOLEAN },
                  },
                  required: ["name", "quantity", "isFromFridge"],
                },
              },
              missingIngredients: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    quantity: { type: Type.STRING },
                  },
                  required: ["name", "quantity"],
                },
              },
              steps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Schritt-für-Schritt Zubereitung",
              },
              caloriesPerServing: { type: Type.NUMBER, description: "Kalorien pro Portion" },
              proteinGrams: { type: Type.NUMBER },
              carbsGrams: { type: Type.NUMBER },
              fatGrams: { type: Type.NUMBER },
              wastePreventionTip: { type: Type.STRING, description: "Warum dieses Rezept Verschwendung vermeidet" },
            },
            required: [
              "title",
              "description",
              "prepTimeMinutes",
              "difficulty",
              "usedIngredients",
              "steps",
              "wastePreventionTip",
            ],
          },
        },
      },
    });

    const resultText = response.text || "[]";
    const data = JSON.parse(resultText);
    res.json(data);
  } catch (err: any) {
    console.error("Fehler bei Rezeptgenerierung:", err);
    res.status(500).json({ error: err.message || "Fehler beim Generieren der Rezepte." });
  }
});

// 3. AI Kitchen Assistant Chat Route
app.post("/api/ai-chef", async (req, res) => {
  try {
    const { message, history = [], inventoryContext = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Keine Nachricht übermittelt." });
    }

    const ai = getGeminiClient();

    const inventorySummary = Array.isArray(inventoryContext) && inventoryContext.length > 0
      ? `Aktueller Kühlschrankinhalt des Nutzers:\n` + inventoryContext.map((i: any) => `- ${i.name} (${i.quantity} ${i.unit}, läuft in ${i.daysUntilExpiry ?? "?"} Tagen ab)`).join("\n")
      : "Kühlschrankinhalt ist aktuell leer oder unbekannt.";

    const systemInstruction = `Du bist "Chef Scan AI", ein freundlicher, kompetenter Küchenassistent und Lebensmittel-Retter.
Du antwortest präzise, sympathisch und praxisnah auf Deutsch.
Du kennst den aktuellen Kühlschrank- und Vorratsbestand des Nutzers und kannst direkt darauf eingehen.
Gib Tipps zur optimalen Lagerung, Haltbarkeit, Rezeptanpassungen, Ersatzzutaten und cleverer Verwertung.

${inventorySummary}`;

    let response;
    try {
      const chat = ai.chats.create({
        model: "gemini-3.6-flash",
        config: { systemInstruction },
      });
      response = await chat.sendMessage({ message });
    } catch (chatErr: any) {
      console.warn("[AI Chef] gemini-3.6-flash failed, falling back to gemini-2.5-flash:", chatErr?.message);
      const chatFallback = ai.chats.create({
        model: "gemini-2.5-flash",
        config: { systemInstruction },
      });
      response = await chatFallback.sendMessage({ message });
    }

    res.json({ text: response.text });
  } catch (err: any) {
    console.error("Fehler im AI Chef Chat:", err);
    res.status(500).json({ error: err.message || "Fehler bei der KI-Antwort." });
  }
});

// 4. Barcode Food Lookup Route (Open Food Facts + Auto-Fallback)
app.post("/api/barcode-lookup", async (req, res) => {
  try {
    const { barcode } = req.body;
    if (!barcode) {
      return res.status(400).json({ error: "Kein Barcode angegeben." });
    }

    // Extract digits only from raw scanner string
    const rawDigits = barcode.toString().replace(/\D/g, "").trim();
    if (!rawDigits) {
      return res.status(400).json({ error: "Ungültiges Barcode-Format." });
    }

    // Try candidates: exact digits, and padded to 13 digits if shorter
    const candidates = [rawDigits];
    if (rawDigits.length < 13) {
      candidates.push(rawDigits.padStart(13, "0"));
    }

    // 1. Query Open Food Facts API (German & World mirrors)
    for (const code of candidates) {
      const urls = [
        `https://de.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`,
        `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`,
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`
      ];

      for (const offUrl of urls) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 sec timeout

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
                const fullName = brand && !nameRaw.toLowerCase().includes(brand.toLowerCase())
                  ? `${brand} ${nameRaw}`
                  : nameRaw;

                const imageUrl = p.image_front_url || p.image_front_small_url || p.image_url || "";
                const quantityStr = p.quantity || "1 Stück";

                const categoriesStr = ((p.categories_tags || []).join(" ") + " " + (p.categories || "") + " " + nameRaw).toLowerCase();
                let category = "sonstiges";
                let icon = "📦";
                let storageLocation = "kuehlschrank";
                let estimatedDays = 14;

                if (categoriesStr.includes("dairy") || categoriesStr.includes("milch") || categoriesStr.includes("käse") || categoriesStr.includes("joghurt") || categoriesStr.includes("butter") || categoriesStr.includes("quark") || categoriesStr.includes("sahne") || categoriesStr.includes("schmand")) {
                  category = "milchprodukte";
                  icon = "🧀";
                  storageLocation = "kuehlschrank";
                  estimatedDays = 10;
                } else if (categoriesStr.includes("beverage") || categoriesStr.includes("getränk") || categoriesStr.includes("saft") || categoriesStr.includes("wasser") || categoriesStr.includes("soda") || categoriesStr.includes("bier") || categoriesStr.includes("wein") || categoriesStr.match(/\\bcola\\b/)) {
                  category = "getraenke";
                  icon = "🧃";
                  storageLocation = "kuehlschrank";
                  estimatedDays = 30;
                } else if (categoriesStr.includes("meat") || categoriesStr.includes("fleisch") || categoriesStr.includes("fisch") || categoriesStr.includes("wurst") || categoriesStr.includes("seafood") || categoriesStr.includes("salami") || categoriesStr.includes("schinken")) {
                  category = "fleisch_fisch";
                  icon = "🥩";
                  storageLocation = "kuehlschrank";
                  estimatedDays = 5;
                } else if (categoriesStr.includes("vegetable") || categoriesStr.includes("gemüse") || categoriesStr.includes("fruit") || categoriesStr.includes("obst") || categoriesStr.includes("salat") || categoriesStr.includes("apfel") || categoriesStr.includes("tomate")) {
                  category = "gemuese_obst";
                  icon = "🥦";
                  storageLocation = "kuehlschrank";
                  estimatedDays = 7;
                } else if (categoriesStr.includes("frozen") || categoriesStr.includes("tiefkühl") || categoriesStr.includes("eis") || categoriesStr.includes("pizza")) {
                  category = "tiefkuehl";
                  icon = "🧊";
                  storageLocation = "gefrierfach";
                  estimatedDays = 90;
                } else if (categoriesStr.includes("snack") || categoriesStr.includes("biscuit") || categoriesStr.includes("süß") || categoriesStr.includes("schokolade") || categoriesStr.includes("pasta") || categoriesStr.includes("reis") || categoriesStr.includes("konserve") || categoriesStr.includes("brot") || categoriesStr.includes("müsli") || categoriesStr.includes("nugat") || categoriesStr.includes("nuss") || categoriesStr.includes("aufstrich")) {
                  category = "vorrat_trocken";
                  icon = "🍞";
                  storageLocation = "vorratsschrank";
                  estimatedDays = 180;
                } else if (categoriesStr.includes("sauce") || categoriesStr.includes("dip") || categoriesStr.includes("ketchup") || categoriesStr.includes("senf") || categoriesStr.includes("mayo")) {
                  category = "saucen_dips";
                  icon = "🥫";
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
                  brand: brand,
                  imageUrl: imageUrl,
                  source: "Open Food Facts",
                  barcode: rawDigits
                });
              }
            }
          }
        } catch (offErr) {
          console.warn(`OFF Fetch Fehler für ${offUrl}:`, offErr);
        }
      }
    }

    // 2. Intelligent Auto-Fallback if not found in Open Food Facts
    try {
      const ai = getGeminiClient();

      const prompt = `Ein Lebensmittelprodukt wurde mit dem Barcode / EAN "${rawDigits}" gescannt. 
Identifiziere wenn möglich das deutsche Markenprodukt (z.B. Haribo, Toffifee, Nutella, Weihenstephan Milch, Barilla Pasta, Coca Cola) oder schätze anhand des EAN-Barcodes ab, um welches konkrete Lebensmittel im deutschen Supermarkt es sich handelt.
Gib sinnvolle, genaue Werte für Name, Marke, Kategorie (milchprodukte, gemuese_obst, fleisch_fisch, saucen_dips, getraenke, vorrat_trocken, tiefkuehl, sonstiges), passendes Emoji Icon (z.B. 🧀, 🥦, 🥩, 🥫, 🧃, 🍞, 🧊, 📦), Lagerort, Menge und empfohlene Haltbarkeit in Tagen zurück.`;

      const response = await generateGeminiContentWithFallback(ai, {
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              brand: { type: Type.STRING },
              category: { type: Type.STRING },
              categoryIcon: { type: Type.STRING },
              storageLocation: { type: Type.STRING },
              estimatedQuantity: { type: Type.NUMBER },
              unit: { type: Type.STRING },
              estimatedDaysUntilExpiry: { type: Type.NUMBER },
            },
            required: ["name", "category", "categoryIcon", "storageLocation", "estimatedQuantity", "unit", "estimatedDaysUntilExpiry"],
          },
        },
      });

      const data = JSON.parse(response.text || "{}");
      return res.json({
        name: data.name || `Artikel (${rawDigits})`,
        brand: data.brand || "",
        category: data.category || "sonstiges",
        categoryIcon: data.categoryIcon || "📦",
        storageLocation: data.storageLocation || "kuehlschrank",
        estimatedQuantity: data.estimatedQuantity || 1,
        unit: data.unit || "Stück",
        estimatedDaysUntilExpiry: data.estimatedDaysUntilExpiry || 14,
        source: "Automatische Erfassung",
        barcode: rawDigits
      });
    } catch (aiErr) {
      console.warn("Auto Barcode Erkennung fehlgeschlagen:", aiErr);
      return res.json({
        name: `Gescanntes Produkt (${rawDigits})`,
        category: "sonstiges",
        categoryIcon: "📦",
        storageLocation: "kuehlschrank",
        estimatedQuantity: 1,
        unit: "Stück",
        estimatedDaysUntilExpiry: 14,
        brand: "",
        source: "Barcode Erfassung",
        barcode: rawDigits
      });
    }
  } catch (err: any) {
    console.error("Barcode Lookup Fehler:", err);
    return res.json({
      name: `Gescanntes Produkt`,
      category: "sonstiges",
      categoryIcon: "📦",
      storageLocation: "kuehlschrank",
      estimatedQuantity: 1,
      unit: "Stück",
      estimatedDaysUntilExpiry: 14,
      source: "Lokal",
      barcode: req.body?.barcode || ""
    });
  }
});

// 5. OCR Expiration Date (MHD) Recognition Route
app.post("/api/scan-mhd", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg" } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "Kein Bild übermittelt." });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    try {
      const ai = getGeminiClient();

      const prompt = `Du bist ein hochpräziser OCR-Scanner für Mindesthaltbarkeitsdaten (MHD / Exp. Date / Best Before) auf Lebensmittelverpackungen.
Analysiere dieses Bild vom Aufdruck auf der Lebensmittelverpackung.

WICHTIGE ANWEISUNG FÜR DOT-MATRIX & LASERGRAVUREN:
Rekonstruiere Dot-Matrix-Druck, Inkjet-Sprühdots, Punktdruck und unterbrochene Lasergravur-Striche mental zu Ziffern 0-9 und Trennzeichen (z.B. '.', '/', '-').
Achte besonders auf schwer lesbare oder unterbrochene Punktdruck-Muster wie '8' vs '3' vs '0', '1' vs 'I', oder helle Gravuren auf dunklem Plastik.

Suche nach Datumseingaben wie z.B.:
- "MHD: 24.11.2026" oder "24.11.26" oder "24/11/26" oder "241126"
- "EXP 15.08.25" oder "BEST BEFORE 12.09.2026"
- "mindestens haltbar bis: 05.10.26"

Aufgabe:
1. Extrahiere das gegebene MHD im Format YYYY-MM-DD (z.B. 2026-11-24). Falls nur Monat/Jahr steht (z.B. 11/26), wähle den letzten Tag des Monats (z.B. 2026-11-30).
2. Gib die geschätzten verbleibenden Tage ab heute (aktuelles Jahr 2026) an.
3. Gib den im Bild erkannten Rohtext an.
4. Falls das Punktmuster mehrdeutig ist, gib alternative Lesarten in 'alternativeReadings' an (z.B. ["2026-11-24", "2028-11-24"]).`;

      const response = await generateGeminiContentWithFallback(ai, {
        contents: {
          parts: [
            {
              inlineData: {
                data: cleanBase64,
                mimeType: mimeType,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedDateIso: { type: Type.STRING, description: "Gefundenes Datum im Format YYYY-MM-DD" },
              rawText: { type: Type.STRING, description: "Erkannter Aufdruck-Text z.B. MHD 12.10.26" },
              confidence: { type: Type.NUMBER, description: "Sicherheit 1-100" },
              alternativeReadings: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Alternative Auslegungen bei mehrdeutigem Punktdruck"
              }
            },
            required: ["detectedDateIso", "rawText", "confidence"],
          },
        },
      });

      const resultText = response.text || "{}";
      const data = JSON.parse(resultText);
      return res.json(data);
    } catch (aiErr: any) {
      console.warn("MHD OCR Scan AI Fehler:", aiErr);
      // Generate a fallback default date 14 days in future if AI fails
      const fallbackDate = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
      return res.json({
        detectedDateIso: fallbackDate,
        rawText: "Standard MHD (+14 Tage)",
        confidence: 50,
      });
    }
  } catch (err: any) {
    console.error("MHD Scan Fehler:", err);
    const fallbackDate = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
    return res.json({
      detectedDateIso: fallbackDate,
      rawText: "Manuelles Datum vorausgewählt",
      confidence: 30,
    });
  }
});

// Start Vite middleware in Dev or static build in Prod
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Kühlschrank Scan AI] Server gestartet auf http://localhost:${PORT}`);
  });
}

startServer();
