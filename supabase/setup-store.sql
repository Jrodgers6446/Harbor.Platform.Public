-- 1. the store (franchise)
insert into franchises (name) values ('Example Store') returning id;   -- copy the id it returns

-- 2. you, as a manager of that store (use 'overwatch' instead of 'manager' for the platform admin)
insert into profiles (user_id, franchise_id, role, display_name, email)
values ('<your user id from Authentication > Users>', '<franchise id from step 1>', 'manager', 'Your Name', 'you@example.com');

-- 3. each tech (create their login in Authentication > Users first)
-- insert into profiles (user_id, franchise_id, role, display_name, email)
-- values ('<tech user id>', '<franchise id>', 'tech', 'Jane Tech', 'jane.tech@example.com');
