APLICACIÓN MÓVIL DE PARTES DE TRABAJO

Contenido
- Aplicación web instalable (PWA) para Android.
- Funciona sin conexión después de instalarse.
- Guarda los partes en el propio teléfono.
- Exporta siempre los registros en un archivo Excel real (.xlsx).
- Cada parte incluye un tipo de camión: Rigido, Camión y remolque, Trailer, Mega o DuoTrailer.
- Incluye 74 trabajadores y 53 matrículas.
- Solicita usuario y contraseña una sola vez por dispositivo.
- Incluye una pestaña de administración protegida para gestionar trabajadores y camiones.
- Las listas de Administración se sincronizan para todos los dispositivos mediante Firebase.

INSTALACIÓN EN ANDROID
1. Publique todos los archivos de esta carpeta en una dirección HTTPS.
   La opción más sencilla es GitHub Pages.
2. Abra esa dirección con Google Chrome en el móvil.
3. Pulse "Instalar" en la cabecera. Si no aparece, use el menú de Chrome
   (tres puntos) > "Añadir a pantalla de inicio" o "Instalar aplicación".
4. La aplicación quedará como un icono normal y funcionará sin conexión.

IMPORTANTE
- Los partes de trabajo se almacenan únicamente en el navegador del teléfono.
- Los trabajadores y camiones se comparten entre todos los dispositivos.
- La aplicación consulta la lista más reciente al abrirla o volver a primer plano.
- Hace falta conexión a Internet para recibir o guardar cambios de Administración; la última lista recibida queda disponible sin conexión.
- Antes de borrar datos de Chrome o cambiar de móvil, use "Exportar a Excel".

PRUEBA EN UN ORDENADOR
No abra index.html directamente. Sirva la carpeta con un servidor local HTTPS
o con una plataforma de publicación web. Los service workers no funcionan
desde direcciones file://.
