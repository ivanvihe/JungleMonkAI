# JungleMonkAI

## Flujo de compartición entre agentes

El panel de conversación ahora permite reenviar respuestas entre agentes para acelerar revisiones y hand-offs técnicos.

1. Sitúate sobre cualquier bloque de código generado por un agente y abre la barra de acciones.
2. Pulsa **Enviar a…** para desplegar el selector de agentes activos. Solo aparecen los modelos encendidos en el panel lateral.
3. Selecciona el agente de destino. Se registrará un apunte interno y se creará una nueva respuesta pendiente con el contexto compartido.
4. El contenido canónico (si procede de un bloque de código) se copia automáticamente al compositor para que puedas editarlo antes de reenviarlo.

Cada compartición queda registrada en `shared-messages.json` (almacenamiento local o `AppData` en Tauri) junto al historial de correcciones para facilitar la trazabilidad del dashboard de calidad.

## Controles sobre los mensajes

- El botón **Usar como borrador** en la cabecera de cada mensaje no humano carga su contenido en el compositor y limpia adjuntos previos.
- Puedes seguir utilizando **Añadir al compositor** para insertar fragmentos específicos sin reemplazar el borrador actual.
- El dashboard de calidad incorpora una sección **Mensajes compartidos** con el histórico de hand-offs más recientes.

## Pruebas

Ejecuta toda la batería de tests con:

```bash
npm test
```
