# Notas de la versión

## Migración de modelo Groq recomendado

- Se actualizó el modelo sugerido para Groq a `llama-3.2-90b-text` para alinearse con la lista vigente de la API.
- Los agentes y diagnósticos ahora utilizan este modelo por defecto y ofrecerán un fallback automático en caso de deprecaciones.
- Si tus presets hacen referencia a identificadores antiguos (`llama-3.1-70b-versatile`, `llama3-70b-8192`, etc.), se redirigirán al nuevo modelo. También puedes optar por `mixtral-8x7b-32768` si necesitas una alternativa compatible.
