# Checklist para extensiones de JungleMonkAI

## Layout y navegación
- [ ] Validar que el `Sider` respeta las preferencias almacenadas (posición, ancho y estado colapsado).
- [ ] Probar breakpoints `xl`, `lg` y `md` para asegurar que Drawer y paneles se muestran correctamente.
- [ ] Actualizar breadcrumbs y context switcher con el nuevo módulo o vista.

## Componentes reutilizables
- [ ] Usar `ProSectionCard`, `ProDataTable` o `ProListPanel` antes de crear nuevos contenedores.
- [ ] Añadir props `aria-label` y `role` cuando corresponda para mantener la accesibilidad.
- [ ] Documentar cualquier variación de estilo en `README.md` o en comentarios del componente.

## Experiencia de usuario
- [ ] Registrar atajos adicionales en `App.tsx` siguiendo el patrón existente de notificaciones.
- [ ] Integrar feedback visual (notificaciones o badges) al introducir nuevos flujos críticos.
- [ ] Evaluar si se requiere un Drawer o modal ligero antes de abrir un diálogo de pantalla completa.

## QA
- [ ] Ejecutar `npm run lint` y `npm test` tras los cambios.
- [ ] Añadir pruebas unitarias para los nuevos componentes o atajos.
- [ ] Actualizar esta checklist si el flujo de contribución evoluciona.
