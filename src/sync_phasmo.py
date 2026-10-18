#!/usr/bin/env python3
"""Copia la Guía Phasmophobia de Claude al sitio (phasmophobia/index.html) agregando ícono y manifiesto.
Uso: python3 src/sync_phasmo.py RUTA/index_del_artifact.html"""
import sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
s = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
old = "<!doctype html><html><head><meta charset=utf8>"
assert s.count(old) == 1
head = ('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Guía Phasmophobia</title>'
        '<link rel="manifest" href="manifest.json"><link rel="icon" type="image/png" href="favicon.png">'
        '<link rel="apple-touch-icon" href="apple-touch-icon.png"><meta name="theme-color" content="#110506">'
        '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">'
        '<meta name="apple-mobile-web-app-title" content="Phasmophobia">')
(ROOT / "phasmophobia" / "index.html").write_text(s.replace(old, head, 1), encoding="utf-8")
print("phasmophobia/index.html listo")
