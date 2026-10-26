# Examen de Matemáticas · 4.º

Proyecto web independiente para el examen final de matemáticas del tercer periodo de la I.E.D. San Francisco Javier. No usa el código, usuarios, configuración, datos ni proyecto Firebase de BAYCANJA.

## Incluye

- Examen web con las siete preguntas del documento, cinco grados (4-1 a 4-5), cronómetro de 45 minutos y puntaje automático de 100 puntos.
- Cloud Function que controla intentos por IP, guarda respuestas/notas en Firestore y aplica el límite de tiempo desde el servidor.
- Acceso separado de coordinación con Firebase Authentication y panel privado para notas/CSV.
- Reglas que impiden acceso directo desde el navegador a las colecciones del examen.

## Configuración de Firebase

Se necesita un proyecto Firebase propio para este examen. Crea un proyecto nuevo en Firebase Console (no selecciones BAYCANJA), registra una app web, habilita Authentication con correo/contraseña y crea Firestore en modo producción. Copia `.env.local.example` como `.env.local` y pega los valores de la app web. Esas claves identifican el proyecto Firebase y no son una cuenta de servicio.

Para habilitar a coordinación:

1. Crea la cuenta administradora en Firebase Authentication.
2. En Firestore crea la colección `mathExamAdmins` y un documento cuyo ID sea el UID de esa cuenta; agrega `active: true` (boolean).
3. Conserva el UID de la cuenta solo para personal de coordinación. El panel también lo muestra cuando el usuario aún no tiene permiso.

La base conserva `mathExamAttempts` y `mathExamIpLocks`; las reglas del cliente deniegan lectura y escritura. La Cloud Function usa el Admin SDK en el servidor.

## Ejecutar y publicar

```powershell
npm install
Copy-Item .env.local.example .env.local
npm run dev
```

Para desplegar, inicia sesión en Firebase CLI, selecciona el proyecto nuevo y publica Hosting, reglas y funciones:

```powershell
firebase login
firebase use --add
npm run build
firebase deploy --only hosting,firestore:rules,functions
```

Cloud Functions requiere el plan Blaze de Firebase y la habilitación de facturación/servicios de Google Cloud. Revisa el costo estimado y las cuotas del proyecto antes de aplicarlo a una evaluación de todo el colegio.

## Requisito de IP

El bloqueo permite un inicio por IP pública. Si muchos estudiantes usan el mismo Wi-Fi institucional, solo uno podrá empezar; para un salón conectado a una misma red, cambia esa restricción por un intento por estudiante antes de publicarlo. En Firestore se guarda un hash de la IP, no la IP legible.
