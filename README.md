# Examen de Matemáticas · 4.º

Proyecto web independiente para el examen final de matemáticas del tercer periodo de la I.E.D. San Francisco Javier. No usa el código, usuarios, configuración, datos ni proyecto Firebase de BAYCANJA.

## Incluye

- Examen web con las siete preguntas del documento, cinco grados (4-1 a 4-5), cronómetro de 45 minutos y puntaje automático de 100 puntos.
- Cloud Function que controla intentos por IP, guarda respuestas/notas en Firestore y aplica el límite de tiempo desde el servidor.
- Acceso separado de coordinación con Firebase Authentication y panel privado para notas/CSV.
- Reglas que impiden acceso directo desde el navegador a las colecciones del examen.

## Configuración de Firebase

El proyecto `examen-matematicas-4to` ya tiene una app web registrada, Firebase Authentication con correo/contraseña y una base Firestore Standard en modo de producción, ubicada en `southamerica-east1` (São Paulo). El archivo `.firebaserc` selecciona este proyecto para la Firebase CLI. Este checkout tiene su configuración local en `.env.local`; en otro entorno, copia `.env.local.example` a `.env.local` y completa los valores de la app web. Las claves del SDK web identifican el proyecto y no son una cuenta de servicio. `.env.local` está excluido de Git.

Para habilitar a coordinación:

1. Crea la cuenta administradora en Firebase Authentication (correo/contraseña está habilitado).
2. En Firestore crea la colección `mathExamAdmins` y un documento cuyo ID sea el UID de esa cuenta; agrega `active: true` (boolean).
3. Conserva el UID de la cuenta solo para personal de coordinación. El panel también lo muestra cuando el usuario aún no tiene permiso.

La base conserva `mathExamAttempts` y `mathExamIpLocks`; las reglas del cliente deniegan lectura y escritura. La Cloud Function usa el Admin SDK en el servidor.

## Ejecutar y publicar

```powershell
npm install
Copy-Item .env.local.example .env.local
npm run dev
```

Para ejecutar localmente, instala dependencias y prepara el archivo local de configuración:

```powershell
npm install
Copy-Item .env.local.example .env.local
npm run dev
```

Para publicar, inicia sesión en Firebase CLI y publica Hosting, reglas y funciones:

```powershell
firebase login
npm run build
firebase deploy --only hosting,firestore:rules,functions
```

El proyecto sigue en Spark. La interfaz y Authentication/Firestore pueden usarse dentro de sus cuotas gratuitas, pero desplegar `mathExamApi` en Cloud Functions requiere Blaze y vincular facturación. Sin esa función, la aplicación no puede hacer cumplir el límite de IP ni el cronómetro desde el servidor. No cambies de plan sin revisar antes el costo y las cuotas.

## Requisito de IP

El bloqueo permite un inicio por IP pública. Si muchos estudiantes usan el mismo Wi-Fi institucional, solo uno podrá empezar; para un salón conectado a una misma red, cambia esa restricción por un intento por estudiante antes de publicarlo. En Firestore se guarda un hash de la IP, no la IP legible.
