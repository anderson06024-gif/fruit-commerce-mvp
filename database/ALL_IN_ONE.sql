-- ============================================================
-- Fruit Commerce MVP — ALL IN ONE SQL
-- schema + triggers + status machine + RLS + helper views
-- Target: Supabase PostgreSQL
-- ============================================================

-- 0) extensions
create extension if not exists pgcrypto;

-- 1) core tables

-- users profile table (maps 1:1 with auth.users)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  role text not null check (role in ('customer','driver','warehouse','admin')),
  created_at timestamptz default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  origin text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  status text not null check (status in ('pending','paid','processing','shipped','completed','cancelled')),
  total_amount numeric not null check (total_amount >= 0),
  created_at timestamptz default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null check (quantity > 0),
  price numeric not null check (price >= 0)
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null check (status in ('created','assigned','out_for_delivery','delivered','failed')),
  qr_code text unique,
  proof_photo_url text,
  delivered_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references public.users(id),
  route_date date not null,
  status text not null check (status in ('created','assigned','in_progress','completed')),
  created_at timestamptz default now()
);

create table if not exists public.route_shipments (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  created_at timestamptz default now(),
  unique(route_id, shipment_id)
);

create table if not exists public.scan_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id),
  shipment_id uuid references public.shipments(id) on delete cascade,
  action text not null check (action in ('pickup','delivered')),
  qr_code text,
  created_at timestamptz default now()
);

-- 2) auth → public.users auto provision
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.users (id, email, role)
  values (new.id, new.email, 'customer')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

-- 3) shipment QR auto-generation
create or replace function public.generate_shipment_qr()
returns trigger
language plpgsql
as $$
begin
  if new.qr_code is null then
    new.qr_code := encode(gen_random_bytes(12), 'hex');
  end if;
  return new;
end;
$$;

drop trigger if exists shipment_qr_generator on public.shipments;
create trigger shipment_qr_generator
before insert on public.shipments
for each row execute function public.generate_shipment_qr();

-- 4) shipment status machine guard
create or replace function public.validate_shipment_status_transition()
returns trigger
language plpgsql
as $$
begin
  if old.status = new.status then
    return new;
  end if;

  if old.status = 'created' and new.status not in ('assigned') then
    raise exception 'Invalid transition from created to %', new.status;
  end if;

  if old.status = 'assigned' and new.status not in ('out_for_delivery') then
    raise exception 'Invalid transition from assigned to %', new.status;
  end if;

  if old.status = 'out_for_delivery' and new.status not in ('delivered','failed') then
    raise exception 'Invalid transition from out_for_delivery to %', new.status;
  end if;

  if old.status in ('delivered','failed') then
    raise exception 'Final shipment state cannot change (from % to %)', old.status, new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists shipment_status_guard on public.shipments;
create trigger shipment_status_guard
before update on public.shipments
for each row execute function public.validate_shipment_status_transition();

-- 5) when route_shipments inserts, auto set shipment to assigned (idempotent)
create or replace function public.update_shipment_on_assign()
returns trigger
language plpgsql
as $$
begin
  update public.shipments
  set status = 'assigned'
  where id = new.shipment_id
    and status = 'created';
  return new;
end;
$$;

drop trigger if exists route_assign_trigger on public.route_shipments;
create trigger route_assign_trigger
after insert on public.route_shipments
for each row execute function public.update_shipment_on_assign();

-- 6) helper view: driver's visible shipments (for debugging / admin)
create or replace view public.v_driver_shipments as
select
  r.id as route_id,
  r.driver_id,
  r.route_date,
  r.status as route_status,
  s.id as shipment_id,
  s.status as shipment_status,
  s.qr_code,
  s.proof_photo_url,
  s.created_at as shipment_created_at
from public.routes r
join public.route_shipments rs on rs.route_id = r.id
join public.shipments s on s.id = rs.shipment_id;

-- 7) RLS enablement
alter table public.users enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.shipments enable row level security;
alter table public.routes enable row level security;
alter table public.route_shipments enable row level security;
alter table public.scan_logs enable row level security;

-- 8) RLS policies

-- users: user can read own profile; admin can read all
drop policy if exists "users_read_own" on public.users;
create policy "users_read_own"
on public.users for select
using (auth.uid() = id);

drop policy if exists "users_admin_all" on public.users;
create policy "users_admin_all"
on public.users for all
using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- products: public read active; admin manage
drop policy if exists "products_public_read" on public.products;
create policy "products_public_read"
on public.products for select
using (is_active = true);

drop policy if exists "products_admin_manage" on public.products;
create policy "products_admin_manage"
on public.products for all
using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- orders: customer read/write own; admin all
drop policy if exists "orders_customer_rw" on public.orders;
create policy "orders_customer_rw"
on public.orders for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "orders_admin_all" on public.orders;
create policy "orders_admin_all"
on public.orders for all
using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- order_items: customer items for own orders; admin all
drop policy if exists "order_items_customer_rw" on public.order_items;
create policy "order_items_customer_rw"
on public.order_items for all
using (
  exists (select 1 from public.orders o where o.id = order_items.order_id and o.user_id = auth.uid())
)
with check (
  exists (select 1 from public.orders o where o.id = order_items.order_id and o.user_id = auth.uid())
);

drop policy if exists "order_items_admin_all" on public.order_items;
create policy "order_items_admin_all"
on public.order_items for all
using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- shipments: customer read own shipments; driver read assigned shipments; admin all
drop policy if exists "shipments_customer_read" on public.shipments;
create policy "shipments_customer_read"
on public.shipments for select
using (
  exists (
    select 1 from public.orders o
    where o.id = shipments.order_id and o.user_id = auth.uid()
  )
);

drop policy if exists "shipments_driver_read" on public.shipments;
create policy "shipments_driver_read"
on public.shipments for select
using (
  exists (
    select 1
    from public.routes r
    join public.route_shipments rs on rs.route_id = r.id
    where r.driver_id = auth.uid()
      and rs.shipment_id = shipments.id
  )
);

drop policy if exists "shipments_admin_all" on public.shipments;
create policy "shipments_admin_all"
on public.shipments for all
using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- routes: driver read own; admin all
drop policy if exists "routes_driver_read" on public.routes;
create policy "routes_driver_read"
on public.routes for select
using (driver_id = auth.uid());

drop policy if exists "routes_admin_all" on public.routes;
create policy "routes_admin_all"
on public.routes for all
using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- route_shipments: driver read own; admin all
drop policy if exists "route_shipments_driver_read" on public.route_shipments;
create policy "route_shipments_driver_read"
on public.route_shipments for select
using (
  exists (select 1 from public.routes r where r.id = route_shipments.route_id and r.driver_id = auth.uid())
);

drop policy if exists "route_shipments_admin_all" on public.route_shipments;
create policy "route_shipments_admin_all"
on public.route_shipments for all
using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- scan_logs: driver insert own logs; admin read all
drop policy if exists "scan_logs_driver_insert" on public.scan_logs;
create policy "scan_logs_driver_insert"
on public.scan_logs for insert
with check (actor_id = auth.uid());

drop policy if exists "scan_logs_admin_read" on public.scan_logs;
create policy "scan_logs_admin_read"
on public.scan_logs for select
using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- 9) seed minimal products (safe to re-run)
insert into public.products (name, price, stock, origin, is_active)
values
  ('愛文芒果', 120, 200, '台南玉井', true),
  ('珍珠芭樂', 80, 300, '彰化社頭', true),
  ('蓮霧', 150, 150, '屏東東港', true)
on conflict do nothing;

-- done
