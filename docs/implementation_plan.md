# Plan de profesionalización y extensión de JungleMonkAI

## Fase 0 · Investigación comparativa y definición de visión
- **Benchmarking de clientes consolidados**: Auditar flujos de Slack, Microsoft Teams y Notion AI para extraer patrones de navegación, jerarquías de preferencias y affordances visuales reutilizables (p. ej. agrupación de cuentas vs. bibliotecas, paneles plegables, menús contextuales y accesos rápidos).
- **Mapa de experiencia actual**: Documentar el estado del sidebar, los paneles de preferencias y el flujo de chat existentes para identificar fricciones (por ejemplo, la mezcla de preferencias de modelos, tokens y recursos locales dentro de `PreferenceSection`).
- **Definición de visión UX**: Redactar principios guiados por la modularidad (Recursos vs. Preferencias), consistencia visual y priorización de tareas frecuentes (cambio de modelo, edición de API keys, gestión de contextos).

## Fase 1 · Reorganización de arquitectura de información y navegación
- **Separar recursos navegables de preferencias**: Mantener `MainView::Preferences` para formularios, pero mover listados dinámicos de proveedores y galerías al árbol "Recursos" del sidebar, introduciendo nodos diferenciados para galerías remotas/locales y configuraciones sensibles a tokens.【F:src/state.rs†L15-L133】【F:src/ui/sidebar.rs†L6-L200】
- **Refactor del estado de preferencias**: Dividir `PreferenceSection` en dos enums (`ResourceSection` y `PreferencePanel`) y encapsular descripciones en estructuras con metadatos, reduciendo strings duplicados y permitiendo reutilizar tooltips y breadcrumbs.
- **Breadcrumbs contextuales**: Incorporar en el header un rastro jerárquico (similar a Slack preferences) sincronizado con la selección del árbol para orientar al usuario cuando se desplaza por recursos profundos.

## Fase 2 · Profesionalización visual y sistema de diseño
- **Nuevo tema escalable**: Extender `ui::theme` para soportar escalas tipográficas fluidas, tokens de espaciado y un sistema de color semántico (fondo, borde, énfasis) con variantes claro/oscuro.
- **Componentes reutilizables**: Extraer botones de icono, chips de estado y tarjetas de modelo a componentes reutilizables que apliquen la nueva guía y reduzcan lógica repetida en `sidebar`, `resource_sidebar` y `chat`.
- **Iconografía y microinteracciones**: Integrar micro-animaciones (hover, plegado de ramas) y estados vacíos profesionalizados, tomando referencia de Slack/Teams para minimizar ruido visual.

## Fase 3 · Preferencias profesionales y gestión de credenciales
- **Paneles independientes de API keys**: Construir formularios específicos por proveedor con validación inline, estados de guardado y helpers (p. ej. "Ver documentación"), desacoplados de las galerías para evitar confusión entre descubrimiento y configuración.
- **Preferencias globales modularizadas**: Seccionar la configuración del sistema (caché, recursos, GitHub) en tabs o subsecciones con soporte de búsqueda rápida para localizar ajustes.
- **Historial y auditoría**: Registrar cambios críticos (tokens, límites de recursos) con timestamps y superficie en un panel de "Actividad" dentro de preferencias.

## Fase 4 · Galerías de modelos y recursos unificadas
- **Catálogo remoto**: Implementar vistas de galería por proveedor (Anthropic, OpenAI, Groq, etc.) con tarjetas enriquecidas (nombre, contexto, coste estimado, tags) y filtros multi-criterio; las tarjetas deben permitir comparar con favoritos y lanzar pruebas rápidas.
- **Biblioteca local Jarvis**: Rediseñar el manejo de modelos locales para mostrar estado de instalación, tamaño y acciones rápidas (actualizar, eliminar) dentro de "Recursos › Modelos locales".
- **Sección "Personalización" ampliada**: Añadir recursos para memorias, perfiles y contextos persistentes, integrando repositorios de GitHub y proyectos como fuentes de conocimiento navegables.

## Fase 5 · Experiencia de chat avanzada y herramientas de código
- **Renderizado enriquecido**: Sustituir el render básico por soporte completo de Markdown con bloques de código colapsables, tablas y acciones de copiar, inspirado en la presentación de mensajes de Slack/Notion.
- **Herramientas de desarrollo**: Añadir respuestas con diferencias de código, resúmenes semánticos y vistas previas de archivos. Incorporar comandos rápidos (slash commands) para lanzar acciones (ej. `@jarvis test`).
- **Interconexión de modelos**: Permitir seleccionar modelos por mensaje o hilo, mostrando el proveedor activo y sugerencias contextuales basadas en la tarea (código, resumen, análisis de datos).

## Fase 6 · Productividad y automatización
- **Panel de funciones automatizadas**: Crear workflows guardados que encadenen modelos/remotos con scripts locales, permitiendo lanzar pipelines desde el chat.
- **Integración de proyectos**: Conectar repositorios GitHub y proyectos locales como "Recursos" navegables, con previews de README y estado de sincronización.
- **Buscador global**: Implementar un comando universal (Cmd/Ctrl+K) para buscar modelos, conversaciones, preferencias y documentos.
- **Tareas programadas y recordatorios**: Diseñar un gestor visual de jobs (cron-like) para programar ejecuciones recurrentes de prompts, sincronizaciones o scripts, con notificaciones en el chat y estado en tiempo real.
- **Listeners y disparadores**: Establecer un sistema de automatización basado en eventos (mensajes, cambios en repositorios, ejecución de comandos) con listeners configurables desde la UI, permitiendo encadenar acciones (ej. al recibir `TODO:` crear issue en GitHub).

## Fase 7 · Integraciones externas y orquestación
- **Gmail y Google Calendar**: Implementar conectores OAuth seguros para importar threads relevantes, enviar resúmenes y crear/actualizar eventos directamente desde el chat o recursos.
- **Webhooks GitHub y proveedores CI/CD**: Añadir un subsistema que escuche webhooks entrantes para notificar builds, pull requests o incidencias, mostrando tarjetas interactivas con acciones rápidas (merge, asignar, comentar).
- **IFTTT y servicios de automatización**: Permitir que workflows locales se expongan como triggers/actions compatibles con IFTTT, Zapier u otros, abriendo la automatización a ecosistemas externos.
- **Sincronización bidireccional de tareas**: Integrar con gestores como Linear/Jira/Trello mediante APIs, sincronizando estados y comentarios desde el panel de productividad.

## Fase 8 · Integración profunda con el sistema operativo
- **Ejecución segura de comandos**: Crear un servicio sandbox que permita lanzar comandos en Linux con plantillas aprobadas, mostrando logs en tiempo real dentro del chat y solicitando confirmación para operaciones sensibles.
- **Exploración de archivos interna**: Añadir un explorador de archivos con permisos gestionados que permita leer y previsualizar archivos del proyecto, incluyendo diffs en vivo cuando cambian durante sesiones de chat.
- **Monitoreo y métricas locales**: Integrar paneles para visualizar uso de CPU/GPU, memoria y disponibilidad de modelos locales, habilitando alertas en el chat cuando se superen umbrales.
- **API interna para scripts**: Exponer un SDK local para que scripts externos se integren con JungleMonkAI (enviar mensajes, solicitar inferencias, actualizar recursos) facilitando flujos DevOps avanzados.

## Fase 9 · Calidad, pruebas y lanzamiento
- **Refactor y optimización**: Revisar `AppState` para aislar canales asíncronos, reducir clonaciones y mejorar la carga perezosa de recursos. Establecer linting y formateo consistentes.
- **Pruebas de usabilidad**: Ejecutar sesiones con usuarios internos comparando el flujo actualizado contra el actual, midiendo tiempo para cambiar de modelo, localizar tokens y navegar recursos.
- **Documentación y onboarding**: Preparar walkthrough interactivos dentro de la app y documentación técnica que describa la arquitectura extendida y guías de contribución.

## Entregables transversales
- **Design System Living Doc**: Un documento central con guidelines y librería de componentes visuales.
- **Roadmap iterativo**: Planificar sprints quincenales que agrupen hitos de UX, backend y QA para mantener sincronía entre rediseño visual y ampliación funcional.
- **Métricas de éxito**: Definir KPIs (tiempo de cambio de proveedor, errores en configuración, retención de sesiones) y configurar telemetría anónima opcional para medir la mejora continua.
