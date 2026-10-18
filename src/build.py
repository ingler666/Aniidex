#!/usr/bin/env python3
"""Arma el sitio de ingler.me a partir de la Aniidex de Claude.

Uso: python3 src/build.py RUTA/aniidex.html [RUTA/export]
  - aniidex.html: la página tal como se publica en Claude.
  - export (opcional): carpeta con coleccion/, progreso/ y fotos/ (JSON) para crear seed.json.
Genera aniimo/index.html (la Aniidex vive en ingler.me/aniimo).
"""
import json, os, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "aniimo"
src = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")

# Las fotos viven en /fotos/<id>.png en el sitio (en Claude son /_blob/<id>).
src = src.replace("/_blob/${esc(f)}", "fotos/${esc(f)}.png")
src = src.replace("/_blob/${esc(photoFor(sp.id))}", "fotos/${esc(photoFor(sp.id))}.png")
assert "/_blob/" not in src, "quedó una ruta /_blob/ sin convertir"

# El puente con Supabase va antes del script principal.
i = src.index("<script>")
src = src[:i] + '<script src="shim.js"></script>\n' + src[i:]

head = ('<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<title>Mi Aniidex de Idyll</title>\n<link rel="manifest" href="manifest.json">\n<link rel="icon" type="image/png" href="favicon.png">\n'
        '<link rel="apple-touch-icon" href="apple-touch-icon.png">\n<meta name="theme-color" content="#2f6f8f">\n'
        '<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-title" content="Aniidex">\n'
        '<style>html,body{margin:0;padding:0}</style>\n</head>\n<body>\n')
(OUT / "index.html").write_text(head + src + "\n</body>\n</html>\n", encoding="utf-8")
(OUT / "manifest.json").write_text((ROOT / "src" / "manifest.json").read_text(encoding="utf-8"), encoding="utf-8")
(OUT / "shim.js").write_text((ROOT / "src" / "shim.js").read_text(encoding="utf-8"), encoding="utf-8")

if len(sys.argv) > 2:
    exp = pathlib.Path(sys.argv[2])
    seed = {}
    for coll in ("coleccion", "progreso", "fotos"):
        d = exp / coll
        if not d.is_dir():
            continue
        seed[coll] = {}
        for f in sorted(d.glob("*.json")):
            data = json.loads(f.read_text(encoding="utf-8"))
            seed[coll][f.stem] = data
    (OUT / "seed.json").write_text(json.dumps(seed, ensure_ascii=False), encoding="utf-8")
    print("seed.json:", {k: len(v) for k, v in seed.items()})
print("index.html listo")
