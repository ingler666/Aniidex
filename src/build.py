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
        '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22%3E%3Cellipse cx=%228%22 cy=%2211%22 rx=%223.4%22 ry=%222.8%22 fill=%22%232e7d4f%22/%3E%3Ccircle cx=%223.6%22 cy=%227.4%22 r=%221.5%22 fill=%22%232e7d4f%22/%3E%3Ccircle cx=%226.2%22 cy=%224.6%22 r=%221.6%22 fill=%22%232e7d4f%22/%3E%3Ccircle cx=%229.8%22 cy=%224.6%22 r=%221.6%22 fill=%22%232e7d4f%22/%3E%3Ccircle cx=%2212.4%22 cy=%227.4%22 r=%221.5%22 fill=%22%232e7d4f%22/%3E%3C/svg%3E">\n'
        '<style>html,body{margin:0;padding:0}</style>\n</head>\n<body>\n')
(OUT / "index.html").write_text(head + src + "\n</body>\n</html>\n", encoding="utf-8")
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
