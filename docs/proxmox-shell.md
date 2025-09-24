# Shell inspirado en Proxmox

## Auditoría inicial
- **Pantallas revisadas:** `App.tsx`, `SidePanel`, `ChatWorkspace` y `ChatTopBar` para mapear la jerarquía de layout existente.
- **Patrones previos:** uso de `Layout` de Ant Design con un `Header` fijo, un `Content` con columna central y un `SidePanel` duplicado para desktop/móvil.
- **Dolores detectados:**
  - Duplicidad de markup para escritorio y móvil.
  - Tema azul/violeta que chocaba con el look metálico de Proxmox 8/9.
  - Falta de un panel inferior persistente para monitorizar tareas como en Proxmox.

## Paleta y tokens inspirados en Proxmox 8/9
- Fondo base: `#101215`
- Superficie elevada: `#191C21`
- Panel destacado: `#21252B`
- Texto principal: `#F3F5F6`
- Texto atenuado: `#8D939E`
- Acento Proxmox: `#F18F01` (hover `#FF9F1C`)
- Info secundaria: `#7AA5FF`
- Bordes: `rgba(255, 255, 255, 0.08)`
- Sombras suaves: `0 14px 28px rgba(6, 7, 11, 0.38)`

> Estos valores se reflejan en los nuevos tokens del tema (`src/theme/tokens.ts`) y en las variables globales (`src/theme/global.css`).

## Wireframe del nuevo layout
```
┌───────────────────────────────────────── Header (estado + tabs) ─────────────────────────────────────────┐
│ ChatTopBar (status global, tabs Chat/Repo/Canvas, acciones)                                             │
├───── Sider (árbol de agentes) ────────┬────────────────────────── Contenido central ────────────────────┤
│ SidePanel (fijo, colapsable)         │ ┌──────────────────────────────────────────────────────────────┐ │
│                                       │ │ Carta principal (ChatWorkspace / RepoStudio / CodeCanvas)    │ │
│                                       │ └──────────────────────────────────────────────────────────────┘ │
├───────────────────────────────────────┴──────────── Panel inferior de tareas (TaskActivityPanel) ───────┤
│ Monitor en tiempo real de agentes, progreso y pendientes                                               │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Notas de theming
- Se adoptó `ProLayout` de Ant Design Pro como contenedor principal, obteniendo header y sider fijados sin implementar lógica manual.
- El panel inferior usa `ProCard` con gradientes suaves y tokens actualizados para replicar el acabado metálico.
- Se añadió un wrapper `app-surface-card` para replicar las tarjetas satinadas de Proxmox en el contenido central.

## Próximos pasos sugeridos
- Integrar estados reales (logs / cola de tareas) en `TaskActivityPanel`.
- Añadir toggles rápidos de vista en el header (modo oscuro/claro) reutilizando `ProLayout`.
- Revisar gradientes en pantallas de alto brillo para asegurar contraste suficiente.
