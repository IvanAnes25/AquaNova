-- Apply once to the existing AquaNova database before using the auth endpoints.
-- These changes preserve all existing user rows and password hashes.
ALTER TABLE users
    ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 0;

-- Existing "admin" users remain admins; the new auth feature stores owners as "owner".
ALTER TABLE users
    MODIFY COLUMN role ENUM('customer', 'admin', 'owner') NOT NULL DEFAULT 'customer';
