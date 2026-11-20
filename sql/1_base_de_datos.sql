-- =====================================================================
-- PARTES DE REPARTO · Premier Pigs  —  Base de datos en Neon
-- Requisitos previos en Neon Console: Auth activado y Data API activado.
-- Ejecutar UNA VEZ en Neon Console > SQL Editor (se puede repetir sin problema).
-- =====================================================================

-- Perfiles: qué persona es cada usuario y qué rol tiene
--   admin      -> ve y hace todo
--   farmacia   -> asigna viajes, ve y edita todos los partes
--   consulta   -> solo ve los partes (Javi)
--   repartidor -> rellena su propio parte (Victor, Cristian)
create table if not exists public.perfiles (
  id       text primary key,            -- id del usuario de Neon Auth
  usuario  text unique not null,
  nombre   text not null,
  rol      text not null check (rol in ('admin','farmacia','consulta','repartidor'))
);

create table if not exists public.viajes (
  id            uuid primary key default gen_random_uuid(),
  fecha         date not null default current_date,
  repartidor    text not null,
  origen        text not null,
  hora_carga    text not null default '',
  destinos      jsonb not null default '[]'::jsonb,  -- [{lugar, articulos, hora_descarga}]
  notas         text not null default '',
  asignado_por  text not null,
  creado        timestamptz not null default now()
);

create table if not exists public.tareas (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null default current_date,
  repartidor   text not null,
  descripcion  text not null,
  mandado_por  text not null default '',
  hora_inicio  text not null default '',
  hora_fin     text not null default '',
  creado       timestamptz not null default now()
);

create index if not exists viajes_fecha_idx on public.viajes (fecha);
create index if not exists tareas_fecha_idx on public.tareas (fecha);

-- Funciones de ayuda (leen el usuario conectado del token de Neon Auth)
create or replace function public.mi_rol() returns text
language sql stable security definer set search_path = public as
$$ select rol from public.perfiles where id = auth.user_id() $$;

create or replace function public.mi_nombre() returns text
language sql stable security definer set search_path = public as
$$ select nombre from public.perfiles where id = auth.user_id() $$;

-- La app la llama al entrar para saber quién eres
create or replace function public.mi_perfil() returns setof public.perfiles
language sql stable security definer set search_path = public as
$$ select * from public.perfiles where id = auth.user_id() $$;

-- Permisos de tabla para usuarios con sesión iniciada (nadie sin sesión)
grant usage on schema public to authenticated;
grant select on public.perfiles to authenticated;
grant select, insert, update, delete on public.viajes, public.tareas to authenticated;
grant execute on function public.mi_rol(), public.mi_nombre(), public.mi_perfil() to authenticated;
do $$ begin
  revoke all on public.perfiles, public.viajes, public.tareas from anonymous;
exception when undefined_object then null; end $$;

-- Seguridad por filas
alter table public.perfiles enable row level security;
alter table public.viajes   enable row level security;
alter table public.tareas   enable row level security;

-- Solo ven perfiles quienes tienen perfil asignado
drop policy if exists "leer perfiles" on public.perfiles;
create policy "leer perfiles" on public.perfiles
  for select to authenticated using (public.mi_rol() is not null);

-- VIAJES
drop policy if exists "leer viajes"   on public.viajes;
drop policy if exists "crear viajes"  on public.viajes;
drop policy if exists "editar viajes" on public.viajes;
drop policy if exists "borrar viajes" on public.viajes;

create policy "leer viajes" on public.viajes
  for select to authenticated using (public.mi_rol() is not null);

create policy "crear viajes" on public.viajes
  for insert to authenticated with check (
    public.mi_rol() in ('admin','farmacia')
    or (public.mi_rol() = 'repartidor' and repartidor = public.mi_nombre() and asignado_por = public.mi_nombre())
  );

create policy "editar viajes" on public.viajes
  for update to authenticated
  using (
    public.mi_rol() in ('admin','farmacia')
    or (public.mi_rol() = 'repartidor' and repartidor = public.mi_nombre())
  )
  with check (
    public.mi_rol() in ('admin','farmacia')
    or (public.mi_rol() = 'repartidor' and repartidor = public.mi_nombre())
  );

-- Un repartidor solo puede borrar los viajes que ha añadido él mismo
create policy "borrar viajes" on public.viajes
  for delete to authenticated using (
    public.mi_rol() in ('admin','farmacia')
    or (public.mi_rol() = 'repartidor' and repartidor = public.mi_nombre() and asignado_por = public.mi_nombre())
  );

-- TAREAS
drop policy if exists "leer tareas"   on public.tareas;
drop policy if exists "crear tareas"  on public.tareas;
drop policy if exists "editar tareas" on public.tareas;
drop policy if exists "borrar tareas" on public.tareas;

create policy "leer tareas" on public.tareas
  for select to authenticated using (public.mi_rol() is not null);

create policy "crear tareas" on public.tareas
  for insert to authenticated with check (
    public.mi_rol() in ('admin','farmacia')
    or (public.mi_rol() = 'repartidor' and repartidor = public.mi_nombre())
  );

create policy "editar tareas" on public.tareas
  for update to authenticated
  using (
    public.mi_rol() in ('admin','farmacia')
    or (public.mi_rol() = 'repartidor' and repartidor = public.mi_nombre())
  )
  with check (
    public.mi_rol() in ('admin','farmacia')
    or (public.mi_rol() = 'repartidor' and repartidor = public.mi_nombre())
  );

create policy "borrar tareas" on public.tareas
  for delete to authenticated using (
    public.mi_rol() in ('admin','farmacia')
    or (public.mi_rol() = 'repartidor' and repartidor = public.mi_nombre())
  );
