# Examen de Matemáticas · 4.º

Sitio independiente para el examen final del tercer periodo de la I.E.D. San Francisco Javier. La interfaz se exporta como sitio estático para Cloudflare Pages; Pages Functions aplica las reglas del examen y Cloudflare D1 almacena los intentos y las notas. Firebase se conserva únicamente para Authentication de coordinación.

## Funciones

- Siete ejercicios del examen, cinco salones (4-1 a 4-5), cronómetro de 45 minutos y calificación automática sobre 100.
- El servidor inicia el reloj, guarda respuestas y entrega automáticamente lo guardado cuando vence el tiempo.
- Un intento por nombre normalizado y salón. Se guarda un hash de la IP pública para identificar coincidencias de red; la IP no bloquea a otros estudiantes que usan el mismo Wi-Fi.
- Panel privado de notas, filtros y descarga CSV. El API valida el token de Firebase y compara el UID con `ADMIN_UID` configurado como secreto en Cloudflare.

## Servicios

- **Cloudflare Pages + Pages Functions:** sitio y API.
- **Cloudflare D1:** base de datos de intentos/notas.
- **Firebase Authentication:** inicio de sesión de coordinación. El proyecto Firebase existente permanece separado; Firestore y Cloud Functions no se usan en esta arquitectura.

## Preparar Cloudflare

1. Instala dependencias con `npm install`.
2. Inicia sesión con `npx wrangler login` y crea el proyecto de Pages con `npm run pages:create`.
3. La base D1 `examen-matematicas-4to` ya está creada y vinculada en `wrangler.toml`.
4. Aplica el esquema con `npm run db:migrate`.
5. En Firebase Authentication crea la cuenta de coordinación con correo y contraseña. Copia su UID desde la consola Firebase.
6. Configura los secretos `ADMIN_UID` e `IP_HASH_SECRET` en Pages con `npx wrangler pages secret put ADMIN_UID --project-name examen-matematicas-4to` y `npx wrangler pages secret put IP_HASH_SECRET --project-name examen-matematicas-4to`. Usa para `IP_HASH_SECRET` una cadena aleatoria larga.
7. Asegúrate de tener las seis variables `NEXT_PUBLIC_FIREBASE_*` en el `.env.local` antes de compilar. Si conectas Pages a GitHub para compilar automáticamente, agrega esas seis variables en la configuración de compilación de Pages.
8. Compila y publica: `npm run build` y luego `npm run pages:deploy`.

El sitio estático queda en `out/`; las rutas API viven en `functions/api/math-exam/[action].js`. El archivo `public/_routes.json` limita las invocaciones de Pages Functions a `/api/math-exam/*`, de modo que los archivos estáticos no consumen esa cuota. `wrangler.toml` contiene el ID de proyecto Firebase público y la vinculación D1. No subas `.dev.vars`, `.env.local` ni secretos al repositorio.

## Desarrollo

```powershell
npm install
Copy-Item .env.local.example .env.local
npm run dev
```

Para probar el sitio estático con Pages Functions y D1 después de configurar `wrangler.toml`, copia `.dev.vars.example` a `.dev.vars`, completa ambos valores y aplica la migración local:

```powershell
npm run build
npx wrangler d1 migrations apply examen-matematicas-4to --local
npx wrangler pages dev out
```

La cuota gratuita de Cloudflare tiene límites diarios. Al alcanzarlos, la API puede dejar de aceptar solicitudes hasta el reinicio de la cuota; revisa el uso en el panel de Cloudflare antes del examen.

## Privacidad y límite de intentos

D1 guarda nombre, salón, respuestas, puntaje, duración, fechas y hashes HMAC de identidad/IP; la clave HMAC permanece como secreto de Cloudflare. El índice único impide un segundo intento con el mismo nombre normalizado y salón. Como no existe una lista oficial de estudiantes, cambiar el nombre podría evadir este control; para vincular el intento a una persona concreta, agrega un código individual por estudiante antes de aplicar el examen.
