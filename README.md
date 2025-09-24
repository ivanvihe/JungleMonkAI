# JungleMonkAI

## Arquitectura de layout responsivo

- El shell principal replica la experiencia de Proxmox con un `Sider` plegable para escritorio y un **Drawer** automático en tablet/móvil. El colapso se sincroniza con `workspacePreferences.sidePanel` para mantener la preferencia por usuario.
- El área de contenido adapta la distribución mediante breakpoints `xl` y `lg`. En pantallas amplias se muestran simultáneamente el workspace, el monitor de actividad y la barra inferior; en resoluciones reducidas se apilan para priorizar el flujo conversacional.
- La cabecera incorpora **breadcrumbs dinámicos** y un *context switcher* (workspace/cluster/insights) que guía la navegación según el ámbito activo.
- Se añadieron paneles flotantes (`Drawer`) para configurar agentes y modelos sin abandonar el contexto principal. Desde escritorio los accesos aparecen en el Sider colapsable; en móvil se integran en el Drawer lateral.

## Biblioteca de componentes reutilizables

- `ProSectionCard`: envoltorio de `ProCard` con estilos consistentes para superficies principales, información complementaria y paneles secundarios.
- `ProDataTable`: tabla con paginación compacta, controles desactivados por defecto y `rowKey="id"` para simplificar listados operativos.
- `ProListPanel`: combina `ProCard` + `ProList` para configuraciones rápidas (por ejemplo, agentes). Acepta `metas` personalizados y mantiene estilo Ant Design Pro.
- Los componentes anteriores se ubican en `src/components/pro` y deben reutilizarse en nuevos módulos para garantizar consistencia visual.

## Atajos, drawers y feedback visual

- Atajos soportados (Ctrl/Cmd + Shift): `A` abre la configuración rápida de agentes, `M` la de modelos, `S` los ajustes globales, `P` el gestor de plugins y `B` alterna el menú lateral.
- Cada atajo genera una notificación (Ant Design) en la esquina inferior derecha para confirmar la acción y orientar al usuario.
- El Drawer de agentes (`AgentQuickConfigDrawer`) permite activar/desactivar instancias al instante; el Drawer de modelos (`ModelQuickConfigDrawer`) habilita cambios básicos de almacenamiento y Hugging Face.
- `QuickActions` adopta la librería pro-component para mostrar accesos coherentes y destacar las rutas de configuración rápida.

## Flujo de compartición entre agentes

El panel de conversación ahora permite reenviar respuestas entre agentes para acelerar revisiones y hand-offs técnicos.

1. Sitúate sobre cualquier bloque de código generado por un agente y abre la barra de acciones.
2. Pulsa **Enviar a…** para desplegar el selector de agentes activos. Solo aparecen los modelos encendidos en el panel lateral.
3. Selecciona el agente de destino. Se registrará un apunte interno y se creará una nueva respuesta pendiente con el contexto compartido.
4. El contenido canónico (si procede de un bloque de código) se copia automáticamente al compositor para que puedas editarlo antes de reenviarlo.

Cada compartición queda registrada en `shared-messages.json` dentro de la carpeta de datos de usuario (por defecto en `%APPDATA%/JungleMonkAI`, `~/Library/Application Support/JungleMonkAI` o `~/.junglemonkai`) junto al historial de correcciones para facilitar la trazabilidad del dashboard de calidad.

## Selección guiada de agentes

- En la cabecera del compositor encontrarás el panel **Destinatarios**, donde puedes activar los agentes que participarán en la próxima petición sin escribir menciones manuales. Para cada proveedor se muestra el modelo sugerido según las reglas de enrutado por defecto y puedes alternarlo cuando existan alternativas disponibles.
- Los indicadores de estado combinan latencia estimada (vía `useAgentPresence`) y una pista de coste por proveedor para ayudarte a escoger el equilibrio entre rapidez y presupuesto antes de lanzar tareas complejas.
- Si sueles repetir combinaciones, guarda la selección como preset: pulsa **Guardar preset** para almacenar el conjunto de agentes, el prompt y el modo de envío (`un único prompt` o `duplicar por agente`). Los presets aparecen junto a las sugerencias rápidas para aplicarlos en un solo clic.
- Al enviar un mensaje con agentes seleccionados, `MessageContext.sendMessage` construye automáticamente las instrucciones necesarias para cada uno y evita que tengas que añadir prefijos en el cuerpo del mensaje.

## Ubicación de datos de usuario

La aplicación guarda la configuración, los registros de calidad y los modelos locales en una carpeta específica para cada usuario.

- **Windows**: `%APPDATA%/JungleMonkAI/`
- **macOS**: `~/Library/Application Support/JungleMonkAI/`
- **Linux**: `~/.junglemonkai/`

Al iniciar la versión de escritorio se detectan instalaciones previas en el directorio de la app y se migra la información al nuevo destino registrando el evento en `migration.log`. Desde los **Ajustes globales → Ubicación de datos** puedes seleccionar una ruta personalizada; la aplicación valida que el directorio sea escribible, mueve los ficheros existentes y actualiza los ajustes persistidos.

## Controles sobre los mensajes

- El botón **Usar como borrador** en la cabecera de cada mensaje no humano carga su contenido en el compositor y limpia adjuntos previos.
- Puedes seguir utilizando **Añadir al compositor** para insertar fragmentos específicos sin reemplazar el borrador actual.
- El dashboard de calidad incorpora una sección **Mensajes compartidos** con el histórico de hand-offs más recientes.

## Jarvis Core local

- Las builds de escritorio incluyen la carpeta `jarvis_core` como recurso cuando está presente en el repositorio. En desarrollo puedes forzar una ubicación distinta mediante `JARVISCORE_DIR=/ruta/a/JarvisCore npm run dev`.
- El intérprete de Python se resuelve con la variable `JARVISCORE_PYTHON`. Si no está definida se prueban `python3` y `python`. Asegúrate de instalar las dependencias listadas en `requirements.txt` antes de iniciar el servicio.
- Cuando **Auto-arranque** está activado, la aplicación invoca los comandos `jarvis_start`, `jarvis_stop` y `jarvis_status` (o sus equivalentes IPC en Electron) para crear, supervisar y apagar el proceso de Jarvis Core. Al cerrar la app se envía un `shutdown` automático para evitar procesos huérfanos.
- Consulta la guía [Jarvis Core en desarrollo local](docs/jarvis-core.md) para ver los requisitos, opciones de configuración y consejos de seguridad.
- Para ejecutar Jarvis Core manualmente en paralelo a la interfaz puedes usar `npm run jarvis:dev` en una terminal y `npm run dev` en otra.

## Tokens y credenciales seguras

- Puedes arrancar la aplicación con tokens predefinidos a través de variables de entorno estándar (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `GH_TOKEN`, `GITLAB_TOKEN`, etc.). Estas credenciales solo se leen al iniciar el proceso (`npm run dev`, `npm run tauri dev`, etc.), por lo que debes reiniciar la aplicación si cambias los valores exportados.
- Desde **Ajustes globales → Proveedores** puedes almacenar los tokens de GitHub y GitLab en el almacén seguro integrado. Al abrir el diálogo se recupera el valor guardado (si existe) y se muestra el campo precargado para que puedas actualizarlo. Guardar un token nuevo sustituye el valor cifrado y la interfaz mantiene el marcador `__secure__` en la configuración; si dejas el campo vacío y pulsas **Eliminar**, el secreto se borra tanto del almacén como del estado de la UI.
- Cuando existen credenciales guardadas desde la UI, el flujo de inicio no requiere variables de entorno para esos proveedores. Puedes combinar ambos métodos según convenga (por ejemplo, definir claves de LLM por entorno y gestionar los tokens de git directamente desde la interfaz).

## Pruebas

Ejecuta toda la batería de tests con:

```bash
npm test
```

Los tests de la API de Jarvis Core se ejecutan con `pytest`:

```bash
pytest
```

## Checklist para nuevos módulos

Consulta [docs/extension-checklist.md](docs/extension-checklist.md) antes de añadir pantallas o paneles. Resume los pasos mínimos para mantener la coherencia visual, UX y las validaciones automáticas.
