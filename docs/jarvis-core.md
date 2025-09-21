# Jarvis Core en desarrollo local

Jarvis Core es un servicio FastAPI que expone los modelos locales y utilidades de automatización para la interfaz de JungleMonkAI. Esta guía resume los requisitos y el flujo básico para ejecutarlo en paralelo al frontend durante el desarrollo.

## Requisitos

- Python **3.10** o superior.
- Herramientas de compilación adecuadas para los bindings utilizados por los modelos (por ejemplo, `build-essential` en Linux).
- Dependencias listadas en [`requirements.txt`](../requirements.txt).

Se recomienda crear un entorno virtual dedicado:

```bash
python3 -m venv .venv
source .venv/bin/activate  # En Windows usa `.venv\\Scripts\\activate`
python -m pip install --upgrade pip
pip install -r requirements.txt
```

## Estructura y directorios

Jarvis Core espera encontrar los modelos descargados en un directorio dedicado. Por defecto el servicio utiliza la ruta indicada en el parámetro `--models-dir`. El repositorio incluye una carpeta `models/` vacía para facilitar las pruebas locales.

## Inicio del servicio

Puedes lanzar el servicio manualmente con:

```bash
python jarvis_core/JarvisCore.py --models-dir ./models
```

Parámetros útiles:

- `--host` y `--port` controlan la IP y el puerto de escucha (por defecto `0.0.0.0:8000`).
- `--token` activa la autenticación por cabecera `Authorization`.
- `--no-auto-start` valida la configuración sin arrancar el servidor (útil en CI).

Las mismas opciones pueden definirse mediante variables de entorno con el prefijo `JARVIS_CORE_` (por ejemplo, `JARVIS_CORE_PORT=9000`). Cuando existe un fichero `jarvis_core/config.json`, sus valores se combinan con los de entorno y CLI siguiendo el orden descrito en el propio módulo.

## Ejecución junto al frontend

El paquete `package.json` expone el script `jarvis:dev` para arrancar Jarvis Core mientras se trabaja en la interfaz:

```bash
npm run jarvis:dev
```

En otra terminal inicia la aplicación web o de escritorio con `npm run dev` o `npm run tauri dev`. El frontend detectará el backend local usando la configuración almacenada en **Ajustes globales → Jarvis Core**.

## Configuración desde la aplicación

Desde la UI puedes indicar:

- Host, puerto y protocolo (`http`/`https`).
- Si la app debe intentar iniciar Jarvis Core automáticamente.
- El token de autenticación (se envía en la cabecera `Authorization`).

Los cambios se guardan en la configuración global de JungleMonkAI y se utilizan para construir la URL base del cliente (`http[s]://host:puerto`).

## Consideraciones de seguridad

- Define un token (`--token` o `JARVIS_CORE_TOKEN`) cuando expongas el servicio fuera de `localhost`.
- Limita el puerto a redes de confianza o utiliza un túnel seguro si necesitas acceso remoto.
- Revisa los permisos de los directorios compartidos: Jarvis Core solo puede operar dentro de `cwd` y del directorio de modelos configurado.
- Los registros (`/logs`) ocultan el token automáticamente para evitar filtraciones accidentales.
