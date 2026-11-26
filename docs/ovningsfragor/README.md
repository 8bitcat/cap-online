# Övningsbanken – frågesidan till Haris

Artefakt: https://claude.ai/artifact/AthNzkHfgCqGG8H75f8x1q (privat, Carl delar med Haris som **Redigerare**).

- `index.html` = sidan, `ovningar.json` = byggd ur `data/ovningsbank.json` (filmvägar → `media/`, `posters/`).
- Publicera om: kopiera index.html + ovningar.json + `media/small/*.mp4` (→ `media/`) + `assets/posters/*.jpg`
  (→ `posters/`) till en mapp under scratchpad och publicera med samma URL.
- Svaren ligger i artefaktens databas:
  - `svar/<övnings-id>`: beslut (ja|osaker|bort), namn, desc, var[], niva, position[], alder[], erfarenhet[], fas,
    tid, maltid, fardighet[] (första = huvudfärdighet), utr[], sallskap[], yta, plats[], film, start, slut, kommentar, t
  - `nya/<id>`: samma fält + typ, för nya övningar
  - `allmant/svar`: passlangd, filmerna, utanFilm, nivastyr, ordning, mer
- Läs med ArtifactData `list` (`out_dir`) och för in i `data/ovningsbank.json` / content.json / stigen.
