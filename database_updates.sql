-- Add email and password fields to users table for JWT authentication
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255);

-- Update existing users with default email and hashed passwords (for testing)
-- Note: You should update these with real emails and properly hashed passwords
UPDATE users SET email = LOWER(name) || '@example.com' WHERE email IS NULL;

-- You can run this to add a default hashed password for testing
-- Password: 'password123' (bcrypt hashed)
UPDATE users SET password = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy' WHERE password IS NULL;

-- Create image_table if it doesn't exist (for upload functionality)
CREATE TABLE IF NOT EXISTS image_table (
    id SERIAL PRIMARY KEY,
    country_code CHAR(2) NOT NULL,
    image VARCHAR(500) NOT NULL,
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create countries table with ratings if it doesn't exist
CREATE TABLE IF NOT EXISTS countries (
    id SERIAL PRIMARY KEY,
    country_code CHAR(2) UNIQUE NOT NULL,
    country_name VARCHAR(100) NOT NULL,
    rating DECIMAL(2,1) DEFAULT 0
);

-- Add some sample countries with ratings (if they don't exist)
INSERT INTO countries (country_code, country_name, rating) 
VALUES 
    ('FR', 'France', 4.5),
    ('GB', 'United Kingdom', 4.2),
    ('CA', 'Canada', 4.7),
    ('US', 'United States', 4.3),
    ('JP', 'Japan', 4.8),
    ('AU', 'Australia', 4.6)
ON CONFLICT (country_code) DO NOTHING;
