-- =====================================================================
-- Paso 2: asignar nombre y rol a cada usuario.
-- Ejecutar DESPUÉS de dar de alta a los usuarios con la página alta.html.
-- Se puede volver a ejecutar cada vez que añadas a alguien.
-- =====================================================================

-- (Opcional) ver los usuarios creados en Neon Auth:
-- select id, email from neon_auth."user" order by email;

insert into public.perfiles (id, usuario, nombre, rol)
select u.id::text, p.usuario, p.nombre, p.rol
from neon_auth."user" u
join (values
  ('victor',   'Victor',   'repartidor'),
  ('cristian', 'Cristian', 'repartidor'),
  ('farmacia', 'Farmacia', 'farmacia'),
  ('javi',     'Javi',     'farmacia'),   -- puede asignar viajes y tareas
  ('laura',    'Laura',    'admin')
) as p(usuario, nombre, rol)
  on lower(u.email) = p.usuario || '@partes.premierpigs.com'
on conflict (id) do update
  set usuario = excluded.usuario, nombre = excluded.nombre, rol = excluded.rol;

-- Comprobación: debe salir una fila por persona
select usuario, nombre, rol from public.perfiles order by rol, nombre;
