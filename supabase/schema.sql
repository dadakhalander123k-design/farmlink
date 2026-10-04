-- ===== TABLES =====
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('farmer','buyer')),
  name text not null check (char_length(name) between 2 and 80),
  org text not null check (char_length(org) between 2 and 80),
  buyer_type text,
  loc_label text not null,
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);

create table public.profile_private (
  id uuid primary key references public.profiles(id) on delete cascade,
  phone text not null check (phone ~ '^[0-9]{10}$')
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.profiles(id) on delete cascade,
  crop text not null,
  grade text not null check (grade in ('A','B','C')),
  qty numeric not null check (qty >= 0),
  qty0 numeric not null check (qty0 > 0),
  price numeric not null check (price > 0),
  harvest date,
  loc_label text not null,
  lat double precision not null,
  lng double precision not null,
  note text check (char_length(note) <= 120),
  image_url text,
  status text not null default 'active' check (status in ('active','sold','removed')),
  created_at timestamptz not null default now()
);
create index listings_crop_status_idx on public.listings (crop, status);
create index listings_farmer_idx on public.listings (farmer_id);

create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  crop text not null,
  qty numeric not null check (qty > 0),
  max_price numeric not null check (max_price > 0),
  grade text not null check (grade in ('A','B','C')),
  by_date date,
  loc_label text not null,
  lat double precision not null,
  lng double precision not null,
  max_dist numeric not null check (max_dist > 0),
  filled numeric not null default 0 check (filled >= 0),
  status text not null default 'open' check (status in ('open','fulfilled','closed')),
  created_at timestamptz not null default now()
);
create index requirements_crop_status_idx on public.requirements (crop, status);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  req_id uuid not null references public.requirements(id) on delete cascade,
  farmer_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  qty numeric not null check (qty > 0),
  price numeric not null check (price > 0),
  delivery boolean not null default false,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique (req_id, farmer_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete set null,
  farmer_id uuid not null references public.profiles(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  req_id uuid references public.requirements(id) on delete set null,
  crop text not null,
  qty numeric not null check (qty > 0),
  price numeric not null check (price > 0),
  delivery_fee numeric not null default 0 check (delivery_fee >= 0),
  dest_label text not null,
  dest_lat double precision not null,
  dest_lng double precision not null,
  address text check (char_length(address) <= 200),
  pay text not null check (pay in ('Cash on delivery','UPI on delivery','Agreed via offer')),
  status text not null default 'placed' check (status in ('placed','confirmed','preparing','out','delivered','cancelled')),
  status_history jsonb not null default '[]'::jsonb,
  rating int check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_farmer_idx on public.orders (farmer_id);
create index orders_buyer_idx on public.orders (buyer_id);

-- ===== HELPERS =====
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.haversine_km(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
returns double precision language sql immutable as
$$ select 2*6371*asin(sqrt(power(sin(radians(b_lat-a_lat)/2),2)+cos(radians(a_lat))*cos(radians(b_lat))*power(sin(radians(b_lng-a_lng)/2),2)))*1.25 $$;

create or replace function public.delivery_fee(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
returns numeric language sql immutable as
$$ select greatest(40, round((30 + public.haversine_km(a_lat,a_lng,b_lat,b_lng)*2.5)/10)*10)::numeric $$;

-- ===== AUTO-CREATE PROFILE ON SIGN-UP =====
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := new.raw_user_meta_data; r text;
begin
  r := case when m->>'role' in ('farmer','buyer') then m->>'role' else 'buyer' end;
  insert into public.profiles (id, role, name, org, buyer_type, loc_label, lat, lng)
  values (new.id, r, m->>'name', m->>'org', nullif(m->>'buyer_type',''), m->>'loc_label', (m->>'lat')::double precision, (m->>'lng')::double precision);
  insert into public.profile_private (id, phone) values (new.id, m->>'phone');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ===== ROW LEVEL SECURITY =====
alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.listings enable row level security;
alter table public.requirements enable row level security;
alter table public.offers enable row level security;
alter table public.orders enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = public.my_role());

create policy private_read on public.profile_private for select to authenticated using (
  id = auth.uid() or exists (select 1 from public.orders o where
    (o.farmer_id = auth.uid() and o.buyer_id = profile_private.id) or
    (o.buyer_id = auth.uid() and o.farmer_id = profile_private.id)));
create policy private_update_own on public.profile_private for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy listings_read on public.listings for select to authenticated
  using (status <> 'removed' or farmer_id = auth.uid());
create policy listings_insert on public.listings for insert to authenticated
  with check (farmer_id = auth.uid() and public.my_role() = 'farmer');
create policy listings_update_own on public.listings for update to authenticated
  using (farmer_id = auth.uid()) with check (farmer_id = auth.uid());

create policy req_read on public.requirements for select to authenticated using (true);
create policy req_insert on public.requirements for insert to authenticated
  with check (buyer_id = auth.uid() and public.my_role() = 'buyer' and filled = 0 and status = 'open');
revoke update on public.requirements from authenticated;
grant update (status) on public.requirements to authenticated;
create policy req_close_own on public.requirements for update to authenticated
  using (buyer_id = auth.uid()) with check (buyer_id = auth.uid() and status = 'closed');

create policy offers_read on public.offers for select to authenticated using (
  farmer_id = auth.uid() or exists (select 1 from public.requirements r where r.id = offers.req_id and r.buyer_id = auth.uid()));
create policy offers_insert on public.offers for insert to authenticated with check (
  farmer_id = auth.uid() and public.my_role() = 'farmer' and status = 'pending'
  and exists (select 1 from public.listings l join public.requirements r on r.id = req_id
              where l.id = listing_id and l.farmer_id = auth.uid() and l.crop = r.crop and l.qty >= offers.qty));
create policy offers_delete_own_pending on public.offers for delete to authenticated
  using (farmer_id = auth.uid() and status = 'pending');

create policy orders_read on public.orders for select to authenticated
  using (farmer_id = auth.uid() or buyer_id = auth.uid());
-- No insert/update/delete policies on orders: all changes go through the functions below.

-- ===== SELLER STATS (aggregates only, safe to show to all buyers) =====
create or replace view public.seller_stats with (security_invoker = false) as
  select farmer_id,
         count(*) filter (where status = 'delivered') as done,
         count(rating) as rating_count,
         avg(rating)::numeric(3,2) as rating_avg
  from public.orders group by farmer_id;
grant select on public.seller_stats to authenticated;

-- ===== ATOMIC BUSINESS FUNCTIONS =====
create or replace function public.place_order(p_listing uuid, p_qty numeric, p_dest_label text,
  p_dest_lat double precision, p_dest_lng double precision, p_address text, p_pay text)
returns uuid language plpgsql security definer set search_path = public as $$
declare l public.listings; oid uuid;
begin
  if auth.uid() is null or public.my_role() <> 'buyer' then raise exception 'Only buyers can place orders'; end if;
  if p_qty is null or p_qty < 1 then raise exception 'Minimum order is 1 kg'; end if;
  select * into l from public.listings where id = p_listing for update;
  if not found or l.status <> 'active' then raise exception 'This produce is no longer available'; end if;
  if l.qty < p_qty then raise exception 'Only % kg left', l.qty; end if;
  insert into public.orders (listing_id, farmer_id, buyer_id, crop, qty, price, delivery_fee, dest_label, dest_lat, dest_lng, address, pay, status, status_history)
  values (l.id, l.farmer_id, auth.uid(), l.crop, p_qty, l.price, public.delivery_fee(l.lat,l.lng,p_dest_lat,p_dest_lng),
          p_dest_label, p_dest_lat, p_dest_lng, left(coalesce(p_address,''),200), p_pay, 'placed',
          jsonb_build_array(jsonb_build_object('status','placed','at',now())))
  returning id into oid;
  update public.listings set qty = qty - p_qty, status = case when qty - p_qty <= 0 then 'sold' else status end where id = l.id;
  return oid;
end $$;

create or replace function public.advance_order(p_order uuid) returns text
language plpgsql security definer set search_path = public as $$
declare o public.orders; nxt text;
begin
  select * into o from public.orders where id = p_order and farmer_id = auth.uid() for update;
  if not found then raise exception 'Order not found'; end if;
  nxt := case o.status when 'placed' then 'confirmed' when 'confirmed' then 'preparing' when 'preparing' then 'out' when 'out' then 'delivered' else null end;
  if nxt is null then raise exception 'This order cannot be advanced'; end if;
  update public.orders set status = nxt, updated_at = now(),
    status_history = status_history || jsonb_build_array(jsonb_build_object('status',nxt,'at',now())) where id = o.id;
  return nxt;
end $$;

create or replace function public.decline_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order and farmer_id = auth.uid() and status = 'placed' for update;
  if not found then raise exception 'Only new orders can be declined'; end if;
  update public.orders set status = 'cancelled', updated_at = now(),
    status_history = status_history || jsonb_build_array(jsonb_build_object('status','cancelled','at',now())) where id = o.id;
  update public.listings set qty = qty + o.qty, status = 'active' where id = o.listing_id and status <> 'removed';
end $$;

create or replace function public.rate_order(p_order uuid, p_rating int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_rating not between 1 and 5 then raise exception 'Rating must be 1 to 5'; end if;
  update public.orders set rating = p_rating, updated_at = now()
  where id = p_order and buyer_id = auth.uid() and status = 'delivered' and rating is null;
  if not found then raise exception 'You can only rate a delivered order once'; end if;
end $$;

create or replace function public.accept_offer(p_offer uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare f public.offers; r public.requirements; l public.listings; q numeric; oid uuid;
begin
  select * into f from public.offers where id = p_offer for update;
  if not found or f.status <> 'pending' then raise exception 'This offer is no longer available'; end if;
  select * into r from public.requirements where id = f.req_id and buyer_id = auth.uid() for update;
  if not found or r.status <> 'open' then raise exception 'This requirement is not open'; end if;
  select * into l from public.listings where id = f.listing_id for update;
  if not found or l.status <> 'active' or l.qty < f.qty then raise exception 'That produce is no longer available in this quantity'; end if;
  q := least(f.qty, r.qty - r.filled);
  insert into public.orders (listing_id, farmer_id, buyer_id, req_id, crop, qty, price, delivery_fee, dest_label, dest_lat, dest_lng, address, pay, status, status_history)
  values (l.id, l.farmer_id, auth.uid(), r.id, l.crop, q, f.price,
          case when f.delivery then 0 else public.delivery_fee(l.lat,l.lng,r.lat,r.lng) end,
          r.loc_label, r.lat, r.lng, '', 'Agreed via offer', 'confirmed',
          jsonb_build_array(jsonb_build_object('status','confirmed','at',now())))
  returning id into oid;
  update public.listings set qty = qty - q, status = case when qty - q <= 0 then 'sold' else status end where id = l.id;
  update public.offers set status = 'accepted' where id = f.id;
  update public.requirements set filled = filled + q, status = case when filled + q >= qty then 'fulfilled' else status end where id = r.id;
  if r.filled + q >= r.qty then update public.offers set status = 'declined' where req_id = r.id and status = 'pending'; end if;
  return oid;
end $$;

create or replace function public.decline_offer(p_offer uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.offers set status = 'declined' where id = p_offer and status = 'pending'
    and exists (select 1 from public.requirements r where r.id = offers.req_id and r.buyer_id = auth.uid());
  if not found then raise exception 'Offer not found'; end if;
end $$;

create or replace function public.public_stats() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'farmers', (select count(*) from public.profiles where role = 'farmer'),
    'listings', (select count(*) from public.listings where status = 'active' and qty > 0),
    'orders', (select count(*) from public.orders),
    'kg', (select coalesce(sum(qty),0) from public.listings where status = 'active')) $$;

-- lock down function execution
revoke all on function public.place_order(uuid,numeric,text,double precision,double precision,text,text) from public, anon;
revoke all on function public.advance_order(uuid) from public, anon;
revoke all on function public.decline_order(uuid) from public, anon;
revoke all on function public.rate_order(uuid,int) from public, anon;
revoke all on function public.accept_offer(uuid) from public, anon;
revoke all on function public.decline_offer(uuid) from public, anon;
grant execute on function public.place_order(uuid,numeric,text,double precision,double precision,text,text) to authenticated;
grant execute on function public.advance_order(uuid) to authenticated;
grant execute on function public.decline_order(uuid) to authenticated;
grant execute on function public.rate_order(uuid,int) to authenticated;
grant execute on function public.accept_offer(uuid) to authenticated;
grant execute on function public.decline_offer(uuid) to authenticated;
grant execute on function public.public_stats() to anon, authenticated;

-- ===== PHOTO STORAGE =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos','listing-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy photos_read on storage.objects for select using (bucket_id = 'listing-photos');
create policy photos_upload_own on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy photos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ===== REALTIME =====
alter publication supabase_realtime add table public.listings, public.orders, public.offers, public.requirements;
