# Partes de reparto · Premier Pigs

Aplicación web para los partes diarios de los repartidores de medicamento.
Funciona en el móvil y en el ordenador. Cada persona entra con su usuario y contraseña.

| Usuario  | Rol        | Qué puede hacer |
|----------|------------|-----------------|
| farmacia | farmacia   | Asigna viajes y otras tareas, ve y edita todos los partes |
| javi     | farmacia   | Igual que Farmacia: asigna viajes y otras tareas, ve y edita todos los partes |
| victor   | repartidor | Rellena su parte: horas de carga y descarga, otras tareas |
| cristian | repartidor | Igual que Victor |
| laura    | admin      | Todo (y puede ver el parte de cualquier repartidor) |

**Cómo funciona:** la web va en GitHub Pages (gratis). Los datos y los usuarios están en Neon
(proyecto `nameless-hat-82364338`, rama `production`): Postgres, inicio de sesión (Neon Auth) y Data API,
declarados en `neon.ts`. Los permisos de cada rol
los aplica la propia base de datos, así que nadie puede saltárselos aunque manipule la web.

---

## Puesta en marcha (una sola vez)

Necesitas Node.js 20 o superior. Abre una terminal en esta carpeta (o pídeselo a Claude Code):

```bash
npm install
npm i -g neon@latest          # si falla, usa "npx neon@latest" en lugar de "neon"
neon login                    # se abre el navegador para iniciar sesión en Neon
neon deploy                   # activa Postgres + Auth + Data API (neon.ts) y crea .env.local
npm run db:setup              # crea tablas, funciones y permisos
npm run build                 # escribe config.js con las URLs de Neon
npm run test:e2e              # prueba completa contra Neon (crea y borra usuarios de prueba)
npm start                     # abre http://localhost:5173 para probar en tu ordenador
```

`npm run test:e2e` debe terminar con `0 fallidas`. Si falla en "Neon Auth" con *sin sesión*, desactiva la
verificación de email en Neon Auth (los usuarios usan correos ficticios `usuario@partes.premierpigs.com`).

### Publicar en GitHub Pages
1. Sube la carpeta al repositorio (commit + push). `.env.local` no se sube (está en `.gitignore`).
2. En GitHub: **Settings > Pages > Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. Autoriza la dirección de la web en Neon Auth (si no, el login falla con *invalid domain*):
   ```bash
   neon neon-auth domain add https://TU-USUARIO.github.io
   ```

> GitHub Pages en un repositorio **privado** puede requerir un plan de pago de GitHub.
> En un repositorio público el código es visible, pero no los datos ni las contraseñas:
> `config.js` solo contiene direcciones públicas y los permisos los controla la base de datos.

### Crear los usuarios
1. Abre `https://…/alta.html` (o `http://localhost:5173/alta.html`) y crea `victor`, `cristian`, `farmacia`,
   `javi` y `laura`, cada uno con su contraseña (mín. 8 caracteres).
2. Ejecuta `npm run db:roles` (o pega `sql/2_asignar_roles.sql` en el SQL Editor de Neon). Debe salir una fila por persona.

Un usuario creado pero sin rol **no ve nada**, así que aunque alguien encuentre `alta.html`
no puede acceder a los datos.

### En los móviles
Abrir la dirección en el navegador, entrar con el usuario y usar **"Añadir a pantalla de inicio"**.
La sesión se queda guardada.

## Uso diario
- **Farmacia / Javi** → pestaña *Asignar trabajo*: viajes y otras tareas. Para un viaje: fecha, repartidor, de dónde sale (Fábrica Alamús, Fábrica Bujaraloz,
  una granja u otro) y uno o varios sitios de descarga con sus artículos.
- **Repartidor** → pestaña *Mi parte*: pulsa **Ahora** al cargar y en cada descarga. Puede añadir un viaje o un
  sitio no previsto. Al acabar el reparto, apunta las otras tareas (qué, quién la mandó, inicio y fin).
- **Javi / Farmacia** → pestaña *Partes de trabajo*: filtra por fechas y repartidor. **Copiar para Excel** copia
  la tabla para pegarla en una hoja.

Las pantallas se actualizan solas cada 20 segundos y al volver a abrir la app.

## Mantenimiento
- **Añadir a otra persona:** crearla en `alta.html`, añadir su línea en `sql/2_asignar_roles.sql` y ejecutarlo.
- **Cambiar una contraseña:** desde la gestión de usuarios de Neon Auth (o borrar el usuario y volver a crearlo).
- **Exportar todo:** en Neon SQL Editor, `select * from viajes;` / `select * from tareas;` y descargar el resultado.

## Archivos
| Archivo | Para qué |
|---|---|
| `index.html`, `app.js` | La aplicación |
| `config.js` | Direcciones de Neon (las escribe `npm run build`) y lugares de salida |
| `neon.ts`, `.neon` | Servicios de Neon y proyecto enlazado |
| `scripts/` | `build`, `start`, `db:setup`, `db:roles`, `test:e2e` |
| `alta.html` | Crear usuarios |
| `sql/1_base_de_datos.sql` | Tablas y permisos |
| `sql/2_asignar_roles.sql` | Rol de cada usuario |
| `vendor/neon-supabase.js` | Librería oficial de Neon (`@neon/neon-js` 0.10.2) empaquetada |
| `manifest.webmanifest`, `icon.svg` | Icono para instalar en el móvil |
