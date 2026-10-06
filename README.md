# Calorie Log

A simple meal logger for Android. It tracks calories, protein, carbs, fat and fibre against your daily goals.
It's an installable web app: it gets its own icon, opens full screen and works offline.
All your data stays on your phone.

## Getting it onto your phone

The app needs to be hosted at a web address once so Chrome can install it. Your meals are never sent
there; the host only serves the app's files.

**Option A: Netlify (easiest, no tools needed)**
1. Create a free account at https://app.netlify.com and sign in.
2. Go to https://app.netlify.com/drop and drag this whole `CALORIE APP` folder onto the page.
3. You get a link like `https://something.netlify.app`. Optionally rename it under *Site configuration*.

**Option B: GitHub Pages**
1. Create a free GitHub account and a new public repository.
2. Upload this folder's files with *Add file → Upload files*.
3. Go to *Settings → Pages* and deploy from the `main` branch, root folder.

**Then, on your phone:** open the link in **Chrome** → menu (⋮) → **Install app** (or *Add to Home screen*).
Always open the app from that icon.

## Keeping your data safe

- Data is stored in the app's on-phone database. It stays through restarts and updates.
- It is deleted if you uninstall the app or clear Chrome's site data. Use **Settings → Backup & restore**
  now and then. *Share backup* can send the file to Google Drive.
- To move to a new phone: restore the backup file there.

## Updating the app

Edit the files and upload the folder again to the same site. The installed app picks up the new version
the next time it opens online. If you add a new file, also add it to the `APP_FILES` list in `sw.js`
so it works offline.

## Running it on this PC

```
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```
Then open http://localhost:8080.

## Food data

| Source | What | Licence |
|---|---|---|
| [Indian Nutrient Databank (INDB)](https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-) | 1,014 Indian recipes, per 100 g + typical serving | CC BY |
| [USDA FoodData Central](https://fdc.nal.usda.gov/) SR Legacy | 93 hand-picked basics with Indian names (fruit, milk, eggs, raw dals, nuts…) | Public domain |
| USDA FoodData Central FNDDS + SR Legacy | ~10,800 worldwide foods (pizza, pasta, sushi, cereals, snacks…) with portion sizes | Public domain |
| [Open Food Facts](https://world.openfoodfacts.org/) | ~3,000 popular packaged products built in (India first), plus online search | ODbL |

| File | Built by |
|---|---|
| `data/indb.json` | `tools/convert-indb.ps1` |
| `data/basics.json` | `tools/convert-basics.ps1` (list, names, servings in `tools/basics.csv`) |
| `data/global.json` | `tools/convert-usda.ps1` |
| `data/packaged.json` | `tools/fetch-off.ps1` (re-run now and then to refresh popular products) |

INDB's deep-fried items (samosa, pakora…) count all the frying oil in the recipe, so their fat and
calories read high. Create your own version under *My foods* if that matters to you.
