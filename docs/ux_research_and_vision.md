# JungleMonkAI · Investigación comparativa y visión de rediseño

## 1. Resumen ejecutivo
Este documento consolida los hallazgos iniciales para reestructurar la experiencia de navegación y preferencias de JungleMonkAI. Se abarcan tres focos:

1. Benchmarking de clientes consolidados (Slack, Microsoft Teams y Notion AI) para identificar patrones reutilizables.
2. Mapa de experiencia actual de JungleMonkAI que detalla fricciones en sidebar, preferencias y flujo de chat.
3. Principios rectores de la visión UX junto con lineamientos para las fases 1 y 2 del rediseño.

## 2. Benchmarking de clientes consolidados
| Producto | Patrón destacado | Oportunidad para JungleMonkAI |
| --- | --- | --- |
| **Slack** | Preferencias jerarquizadas con breadcrumbs fijos y panel secundario colapsable. | Replicar breadcrumbs sincronizados con la selección del árbol y mantener paneles plegables para subsecciones profundas. |
| **Microsoft Teams** | Sidebar principal divide claramente "Actividad", "Chat" y "Calendario" con iconografía uniforme y estados activos diferenciados. | Separar nodos de recursos navegables vs. preferencias, utilizando iconos con semántica consistente y resaltado según estado activo. |
| **Notion AI** | Configuración modular: formularios de credenciales separados de bibliotecas, tarjetas de recursos con metadatos compactos. | Mover listados dinámicos (modelos, proveedores) al árbol de recursos y dejar `MainView::Preferences` para formularios especializados. |

**Patrones reutilizables clave**
- Agrupación por contexto (actividad vs. configuración) con iconografía consistente.
- Paneles plegables que reducen ruido visual en ramas profundas.
- Menús contextuales con acciones rápidas situadas cerca de cada recurso.
- Breadcrumbs persistentes que conectan la jerarquía con el contenido abierto.

## 3. Mapa de experiencia actual
### 3.1 Sidebar y navegación
- El árbol actual mezcla recursos navegables con formularios de preferencias dentro de `NAV_TREE`, lo que dificulta diferenciar cuándo el usuario verá un listado vs. un formulario. 【F:src/ui/sidebar.rs†L61-L185】
- El mismo `PreferenceSection` se usa tanto para fijar la vista activa como para definir la jerarquía visual, generando dependencias cruzadas entre estado y layout. 【F:src/state.rs†L15-L108】【F:src/ui/sidebar.rs†L17-L180】
- Los nodos secundarios reutilizan estilos ad-hoc (colores RGB inline, márgenes manuales), lo que dificulta un sistema de diseño coherente. 【F:src/ui/sidebar.rs†L204-L278】

### 3.2 Paneles de preferencias
- `PreferenceSection::title()` y `PreferenceSection::description()` contienen cadenas repetitivas y rutas jerárquicas codificadas, impidiendo reutilizar tooltips o breadcrumbs. 【F:src/state.rs†L23-L101】
- Formularios sensibles (API keys, configuración de modelos) conviven con listados y catálogos dentro del mismo enum, incrementando la carga cognitiva.

### 3.3 Flujo de chat
- El flujo de chat depende de `MainView` para alternar vistas, pero carece de breadcrumbs o pistas visuales que expliquen el contexto cuando se cambia a preferencias o recursos. 【F:src/state.rs†L113-L134】【F:src/ui/sidebar.rs†L89-L141】

## 4. Visión UX guiada por principios
1. **Modularidad Recursos vs. Preferencias**: Los recursos navegables (modelos, proveedores, proyectos) deben residir en un árbol dedicado mientras que los formularios y paneles de configuración se gestionan desde `MainView::Preferences`.
2. **Consistencia visual**: Tipografía, espaciados e iconografía deben derivar de un sistema temático expandido (`ui::theme`).
3. **Prioridad en tareas frecuentes**: Cambio de modelo, actualización de API keys y gestión de contextos deben quedar a un máximo de dos interacciones.
4. **Orientación persistente**: Breadcrumbs contextuales y microestados (hover, activo, vacío) deben informar dónde está el usuario y qué acciones están disponibles.

## 5. Lineamientos para la Fase 1 · Reorganización
### 5.1 Separar recursos navegables de preferencias
- Crear un árbol `ResourceSection` que represente galerías remotas y bibliotecas locales, desacoplado de `PreferencePanel` para formularios.
- `MainView::Preferences` seguirá hospedando formularios, pero el sidebar debe diferenciar explícitamente recursos (nodos navegables) de ajustes.
- Introducir nodos específicos para galerías remotas/locales, agrupando por proveedor y distinguiendo configuraciones sensibles a tokens.

### 5.2 Refactor de estado de preferencias
- Descomponer `PreferenceSection` en:
  - `ResourceSection` (enum) con metadatos (`title`, `breadcrumb`, `icon`).
  - `PreferencePanel` (enum) para formularios, acompañado de estructuras `PreferenceDescriptor`.
- Almacenar títulos, descripciones y breadcrumbs en structs reutilizables, eliminando cadenas rígidas y permitiendo localización futura.

### 5.3 Breadcrumbs contextuales
- Añadir a la cabecera un componente `BreadcrumbTrail` que observe la selección del árbol y construya una ruta (`Home › Recursos › Modelos locales › Ollama`).
- El estado del breadcrumb debe sincronizarse con `AppState`, evitando duplicar lógica en cada vista.

## 6. Lineamientos para la Fase 2 · Sistema visual
### 6.1 Nuevo tema escalable
- Extender `ui::theme` con:
  - Escalas tipográficas fluidas (p. ej. `FontScale::Small/Body/Heading`).
  - Tokens de espaciado (`Space::XS/S/M/L/XL`).
  - Paleta semántica (`Surface/Base`, `Surface/Muted`, `Border/Subtle`, `Accent/Primary`, `Accent/Warning`) con variantes claro/oscuro.

### 6.2 Componentes reutilizables
- Extraer componentes para botones de icono, chips de estado y tarjetas de modelo que hoy están definidas inline en el sidebar y otras vistas. 【F:src/ui/sidebar.rs†L204-L278】
- Definir propiedades para estados (hover, focus) usando tokens de color y espaciado compartidos.

### 6.3 Iconografía y microinteracciones
- Sustituir valores RGB codificados por tokens temáticos para los highlights de selección y hover. 【F:src/ui/sidebar.rs†L214-L241】
- Incorporar animaciones suaves de expansión en ramas y estados vacíos profesionalizados similares a Slack/Teams.

## 7. Próximos pasos inmediatos
1. Modelar en código las nuevas estructuras `ResourceSection` y `PreferencePanel` manteniendo compatibilidad temporal con `PreferenceSection`.
2. Implementar prototipo de breadcrumbs reutilizando los metadatos del árbol.
3. Diseñar la ampliación de `ui::theme` e inventariar componentes que migrarán a la librería común.

## 8. Artefactos recomendados
- **Design System Living Doc**: Documentar tokens, componentes y patrones de interacción conforme se desarrollen.
- **Storyboard de navegación**: Mapear recorridos "Cambiar modelo" y "Actualizar API key" utilizando la nueva jerarquía.

