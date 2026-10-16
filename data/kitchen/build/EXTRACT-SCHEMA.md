# Recipe transcription schema

Transcribe recipes from the Spanish manual text faithfully into JSON. Do NOT translate recipe or ingredient names, do NOT invent quantities, do NOT normalise ingredient names across recipes (that is done later). Copy the Spanish text as written.

Output: a single JSON array of recipe objects, written to the output file you are given. Valid JSON (no comments, no trailing commas).

```jsonc
{
  "name": "Salsa de Tomate Mazcina",          // heading exactly as written
  "section": "Bases, fondos y preparaciones intermedias", // the manual section it sits in
  "page": 12,                                 // page number printed at the bottom of the page where the recipe starts
  "use": "Base para pastas, Garlic Prawns, ...", // text after "Uso:", or null
  "yieldText": "1 masa, aprox. 1,75 kg.",     // text after "Rendimiento / porción:", or null
  "lines": [
    {
      "item": "Tomates enlatados",            // ingredient or preparation name exactly as written
      "quantityText": "2.500 g",              // the Cantidad cell exactly as written
      "noteText": null,                        // the Equivalencia / nota cell exactly as written, or null
      "quantity": 2500,                        // parsed number in the unit below, or null if none ("Cantidad necesaria", "Cantidad disponible")
      "unit": "g",                             // one of: "g", "kg", "ml", "l", "each", or null
      "approx": false,                         // true if the text says aprox./approx, a range, or "por confirmar"
      "isPreparation": false                   // true if the item is another recipe in the manual (e.g. "Salsa de Tomate Mazcina", "Alioli", "Pesto Mazcina", "Homemade Potatoes", "Mayonesa de Ajo Mazcina", "Cebolla Encurtida Mazcina", "Puré de ajo confitado", "Aceite aromatizado de Ajo Confitado")
    }
  ],
  "equipment": ["Olla", "Colador"],          // split on "•"; [] if none
  "method": ["Picar cebolla y ajo ...", "..."], // numbered steps, text only, joined across page breaks, without the number
  "criticalPoints": ["Remover cada 20 minutos."], // "Puntos críticos" bullets
  "pending": []                               // any phrase in this recipe that says something is pending / por confirmar / pendiente
}
```

Parsing rules for `quantity` / `unit`:
- Spanish thousands separator: "1.000 g" = 1000 g; "2.500 g" = 2500. Decimal comma: "1,75 kg" = 1.75 kg.
- "580 ml" -> 580, "ml". "3 litros" -> 3, "l". "2 kg" -> 2, "kg".
- Counts: "2 unidades", "3 hojas", "1 rama", "1 paquete", "1 lata", "1 scoop", "1 rodaja", "1 hoja/ramita" -> the number with unit "each" (keep the word in quantityText).
- Spoon / cup measures ("1 cucharada", "1/4 cucharadita", "2 tazas"): if the note gives grams or ml (e.g. "8-10 g aprox."), use that: a range uses the midpoint (9), approx = true. If no gram/ml equivalent is given anywhere, quantity null, unit null, and keep the text.
- Ranges like "20-30 g" or "50-60 g" -> midpoint, approx true.
- "1 receta" or "1 porción" of a preparation -> quantity 1, unit "each", isPreparation true, and copy any note (e.g. "Aprox. 1 kg").
- If the quantity is per portion or per filete, still copy it as written; mention it in noteText if not already there.

Tables split across a page break continue on the next page (the header row repeats): keep them as one list. Ignore page headers "MAZCINA | MANUAL DE RECETAS DE COCINA" and bare page numbers.

When done, reply with: number of recipes, their names, and any line you could not parse confidently (recipe + item + why). Keep the reply under 300 words.
