# Mi Aniidex de Idyll

Sitio de https://ingler.me — Aniidex personal de Aniimo.

- `index.html` y `shim.js` se generan con `python3 src/build.py <aniidex.html> [export]`.
- Los datos (inventario, progreso, fotos) viven en Supabase, protegidos por inicio de sesión.
- `src/setup.sql` crea la tabla y sus reglas de acceso.
