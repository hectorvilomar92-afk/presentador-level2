# PLANI PRESENTACION LEVEL

Aplicación Streamlit de presentaciones educativas con acceso por cuenta,
vencimiento mensual autorizado por un administrador, avisos de un minuto,
imágenes de Wikimedia Commons, referencias y enlaces de YouTube.

## Publicar en Streamlit Community Cloud

Publica el contenido de esta carpeta en GitHub. Si subes la carpeta completa
`presentador-level-main` dentro de otro repositorio, selecciona
`presentador-level-main/app.py` como archivo principal de Streamlit. Si subes
los archivos de esta carpeta directamente a la raíz del repositorio, selecciona
`app.py`.

En Streamlit Community Cloud:

1. Crea una aplicación desde el repositorio y rama que subiste.
2. Selecciona el archivo principal según dónde quedó `app.py`.
3. En **Settings > Secrets**, agrega la URL y la clave pública anon de Supabase:

   ```toml
   SUPABASE_URL = "https://TU-PROYECTO.supabase.co"
   SUPABASE_ANON_KEY = "TU-CLAVE-PUBLICA-ANON"
   ```

4. Guarda y espera a que Streamlit termine la instalación de
   `requirements.txt` y publique la URL.

No pongas la clave `service_role` en la aplicación, en este repositorio ni en
los Secrets de Streamlit.

Para ejecutar localmente, desde esta carpeta:

```sh
python -m pip install -r requirements.txt
python -m streamlit run app.py
```

## Publicar en Google Cloud Run y Firebase Hosting

La app está hecha con Python y Streamlit: Firebase Hosting por sí solo no
ejecuta `app.py`. El [`Dockerfile`](./Dockerfile) prepara la aplicación para
Google Cloud Run, que puede ejecutarla. Firebase Hosting es opcional y puede
dirigir el dominio `*.web.app` al servicio de Cloud Run mediante
[`firebase.json`](./firebase.json).

1. Crea o selecciona un proyecto de Google Cloud, vincúlalo con Firebase y
   activa la facturación. Habilita las API de Cloud Run, Cloud Build y Secret
   Manager.
2. En Secret Manager, crea los secretos `SUPABASE_URL` y `SUPABASE_ANON_KEY`
   con los valores del proyecto Supabase. No uses la clave `service_role`.
3. Crea una cuenta de servicio para Cloud Run y dale acceso
   `Secret Manager Secret Accessor` a esos dos secretos.
4. Instala e inicializa Google Cloud CLI. Desde la carpeta que contiene este
   README, sustituye `TU_PROJECT_ID` y despliega:

   ```sh
   gcloud config set project TU_PROJECT_ID
   gcloud run deploy plani-presentacion-level \
     --source . \
     --region us-central1 \
     --service-account plani-runner@TU_PROJECT_ID.iam.gserviceaccount.com \
     --set-secrets SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_ANON_KEY=SUPABASE_ANON_KEY:latest \
     --allow-unauthenticated \
     --timeout 3600
   ```

   `--allow-unauthenticated` permite que los usuarios abran la app; el acceso a
   sus funciones sigue protegido por el login de Supabase. Cloud Run mostrará
   una URL `run.app` para probar el servicio.
5. Para usar Firebase Hosting, instala Firebase CLI, inicia sesión y selecciona
   el mismo proyecto de Google:

   ```sh
   firebase login
   firebase use --add
   firebase deploy --only hosting
   ```

   La reescritura de Hosting apunta al servicio y región configurados en
   `firebase.json`. La URL pública será `https://TU_PROJECT_ID.web.app`.
   Streamlit requiere una conexión WebSocket activa; prueba el inicio de sesión
   y la navegación tanto desde `web.app` como desde `run.app`. Si la conexión se
   corta detrás de Hosting, utiliza directamente la URL `run.app`.

Cloud Run puede generar cargos según el uso y requiere facturación habilitada.
Revisa las cuotas y precios de Google antes de desplegar.

## Preparar autenticación y datos en Supabase

1. Crea un proyecto en [Supabase](https://supabase.com/), habilita Email en
   **Authentication > Providers** y desactiva el registro público si solo el
   administrador debe autorizar cuentas.
2. En **SQL Editor**, abre y ejecuta el archivo [`supabase_setup.sql`](./supabase_setup.sql).
   Crea las tablas `perfiles` y `avisos`, activa RLS y aplica las políticas de
   acceso. También impide quitar o desactivar al último administrador activo.
3. En **Authentication > Users**, crea manualmente el primer usuario admin y
   confirma su correo. Copia el UUID y ejecuta en SQL Editor, sustituyendo los
   datos de ejemplo:

   ```sql
   insert into public.perfiles (id, nombre, email, rol, activo, vence)
   values ('UUID-DEL-USUARIO', 'Administrador', 'admin@ejemplo.com',
           'admin', true, null);
   ```

4. Crea cada cuenta de usuario en **Authentication > Users**. Por cada cuenta,
   agrega un perfil con el UUID exacto, nombre, correo, `rol = 'usuario'`,
   `activo = true` y su fecha inicial de vencimiento (`AAAA-MM-DD`). Usa
   `vence = null` solo si no debe caducar.
5. Configura los Secrets de Streamlit y publica la app. Los usuarios entran con
   el correo de la cuenta y su contraseña.

El login solo muestra usuario, contraseña, **Aceptar** e información de
contacto. Si falta Supabase, el formulario queda visible, pero el ingreso no
puede funcionar hasta configurar el proyecto y crear el perfil administrador.

## Panel de administrador y vencimientos

En el panel **Administrar usuarios**, el administrador revisa roles, cuentas
activas y días restantes. Puede cambiar el vencimiento y autorizar una
renovación mensual. Si la cuenta aún no venció, el mes se suma a la fecha
vigente; si ya venció, comienza el día de la autorización. La renovación
reactiva la cuenta. No hay reinicio automático sin autorización.

## Avisos

La sección **Avisos** está disponible para el administrador. Permite enviar un
aviso a una sola cuenta o a todos los usuarios. Cada aviso desaparece al minuto;
la base de datos impone esa duración y la app actualiza la pantalla
periódicamente. La tabla y sus políticas están incluidas en
[`supabase_setup.sql`](./supabase_setup.sql).

## Generación de presentaciones

Las presentaciones se crean con contenido de Wikipedia, imágenes atribuidas de
Wikimedia Commons, referencias académicas y bibliográficas, y enlaces de
YouTube. Requiere acceso a internet. No genera imágenes con inteligencia
artificial.

La aplicación real es `app.py`. No la abras mediante `index.html` ni la publiques
como sitio estático de GitHub Pages/Firebase Hosting: ese modo no ejecuta Python
ni aplica el login. Usa Streamlit Community Cloud o Cloud Run; Firebase Hosting
puede servir como dominio frontal del servicio de Cloud Run.
