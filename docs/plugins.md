# Plugins de JungleMonkAI

Los plugins permiten extender JungleMonkAI con nuevos paneles de interfaz, acciones sobre mensajes,
proveedores de agentes y conexiones MCP. Esta guía describe el formato de los manifiestos, el
esquema de archivos esperado y los puntos de integración disponibles tanto en el frontend como en
la capa Tauri.

## Estructura de directorios

Los plugins se cargan desde `~/.config/JungleMonkAI/plugins` (en modo producción) o desde el
subdirectorio `plugins/` creado junto a `config.json` cuando se ejecuta la aplicación en modo
local. Cada plugin ocupa una carpeta con su identificador y debe incluir como mínimo un
`manifest.json`:

```
plugins/
  acme-labs/
    manifest.json
    panels/
      metricsPanel.tsx
    actions/
      shareSnippet.ts
```

Los recursos front-end (componentes React, utilidades, etc.) se compilan dentro del propio bundle
utilizando `import.meta.glob`. Basta con colocar los módulos dentro de `src/plugins/<pluginId>/` y
asegurarse de que `module` en el manifiesto apunta al archivo correcto.

## Manifiesto (`manifest.json`)

Cada plugin se describe mediante un JSON que sigue este esquema simplificado:

```jsonc
{
  "id": "acme-labs",
  "name": "Acme Labs Toolkit",
  "version": "1.2.0",
  "description": "Widgets y acciones para el laboratorio.",
  "integrity": { "algorithm": "sha256", "hash": "…" },
  "compatibility": { "minVersion": "0.1.0" },
  "credentials": [
    {
      "id": "apiKey",
      "label": "Token privado",
      "description": "Claves de servicio de Acme",
      "secret": true
    }
  ],
  "commands": [
    {
      "name": "share-snippet",
      "description": "Envía un bloque de código al panel remoto.",
      "signature": "c0ffee…"
    }
  ],
  "capabilities": [
    { "type": "chat-action", "id": "share", "label": "Compartir con Acme", "command": "share-snippet" },
    { "type": "workspace-panel", "id": "metrics", "label": "Métricas", "slot": "side-panel", "module": "panels/metricsPanel" }
  ]
}
```

### Campos principales

- **`id`**, **`name`** y **`version`** identifican el plugin.
- **`description`**, `author`, `homepage` y `license` son opcionales.
- **`integrity`**: si se declara, el `hash` debe coincidir con la firma SHA-256 del manifiesto
  completo. La aplicación recalcula automáticamente la suma en frontend y backend; cualquier
  discrepancia obliga a revalidar el plugin.
- **`compatibility`**: `minVersion` y `maxVersion` se comparan con `CARGO_PKG_VERSION` en Tauri y con
  `VITE_APP_VERSION` en el frontend. Versiones fuera de rango impiden la carga.
- **`credentials`**: describe campos adicionales que aparecerán en los ajustes globales. Los valores
  se almacenan en `pluginSettings` dentro de la configuración local.
- **`commands`**: cada comando declarable debe incluir un `signature`. La capa Tauri valida que el
  comando exista antes de aceptar una invocación (`plugin_invoke`).
- **`capabilities`**: array de objetos que anuncia lo que el plugin expone:
  - `agent-provider`: adjunta manifiestos de agentes (`agentManifests`).
  - `chat-action`: añade botones a `MessageActions` que delegan en un comando del plugin.
  - `workspace-panel`: registra un componente React adicional para `SidePanel` o la zona principal.
  - `mcp-endpoint`: documenta endpoints compatibles con el protocolo MCP.
  - `mcp-session`: describe sesiones MCP completas, incluyendo endpoints WebSocket/OSC/REST y los permisos disponibles para cada interacción.

## Flujo de carga

1. **Tauri (`PluginManager`)** escanea el directorio `plugins/`, valida firmas, versiones y expone los
   manifiestos a través del comando `plugin_list`.
2. **`PluginHostProvider`** consume esa lista, sincroniza las aprobaciones almacenadas en
   `GlobalSettings`, actualiza `enabledPlugins` y genera contribuciones de UI.
3. **SidePanel** y **MessageActions** consultan el contexto para inyectar paneles adicionales y
   botones de acción. Las credenciales configuradas por el usuario quedan disponibles para los
   propios plugins mediante el almacenamiento de `pluginSettings`.

## Pruebas

El proyecto incluye pruebas de contrato (`vitest`) que cargan un manifiesto ficticio y verifican que
las capacidades se propaguen al UI host. Puedes añadir nuevos casos en `src/core/plugins/__tests__`.

Para comprobar la integridad de un manifiesto puedes ejecutar:

```bash
node -e "const fs=require('fs');const crypto=require('crypto');const raw=fs.readFileSync('manifest.json');const hash=crypto.createHash('sha256').update(raw).digest('hex');console.log(hash);"
```

Incluye el hash resultante en `integrity.hash`.

## Plugins de referencia

### Ableton Remote (`ableton-remote`)

El plugin `ableton-remote` demuestra cómo traducir mensajes MCP en comandos MIDI/OSC:

- Declara una capacidad `mcp-session` con endpoints OSC (`udp://127.0.0.1:9001`) y WebSocket para supervisar el estado de Ableton Live.
- Sus permisos `trigger-scene` y `stop-transport` aparecen como botones adicionales en `MessageActions`. Al pulsarlos, el host invoca el módulo Tauri `ableton.rs`, que reutiliza la configuración de `midi.rs` para enviar notas y mensajes de parada.
- Para utilizarlo basta con seleccionar el puerto MIDI correcto desde los ajustes globales y habilitar el plugin en la pestaña de plugins.

### VS Code Bridge (`vscode-bridge`)

El plugin `vscode-bridge` expone un puente WebSocket (`ws://127.0.0.1:17654`) que permite sincronizar parches y commits con una extensión de VS Code:

- Las sesiones `mcp-session` describen tanto el endpoint WebSocket como un endpoint REST auxiliar pensado para operaciones diagnósticas.
- El módulo `vscode.rs` levanta el servidor y reutiliza `git::apply_patch` y `git::commit_changes` cuando la extensión remota envía mensajes RPC.
- Desde la interfaz los permisos `Abrir en VS Code` y `Aplicar diff en VS Code` publican eventos en el bridge para que los clientes conectados reaccionen.
- Puedes cambiar el puerto por defecto definiendo la variable de entorno `VSCODE_BRIDGE_PORT` antes de iniciar la aplicación.
