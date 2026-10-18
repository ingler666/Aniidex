# Mi Aniidex de Idyll

Sitio de https://ingler.me — portada en `index.html`, Aniidex en `aniimo/` (ingler.me/aniimo) y Guía Phasmophobia en `phasmophobia/`.

- `aniimo/index.html` y `aniimo/shim.js` se generan con `python3 src/build.py <aniidex.html> [export]`.
- Los datos (inventario, progreso, fotos) viven en Supabase, protegidos por inicio de sesión.
- `src/setup.sql` crea la tabla y sus reglas de acceso.
