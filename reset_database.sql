-- Reset and recreate the database tables with proper structure
-- Run this if you're having issues with the users table

-- Drop all tables in correct order (foreign key dependencies)
DROP TABLE IF EXISTS image_table CASCADE;
DROP TABLE IF EXISTS visited_countries CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Create users table with proper SERIAL primary key
CREATE TABLE users(
  id SERIAL PRIMARY KEY,
  name VARCHAR(15) UNIQUE NOT NULL,
  color VARCHAR(15) DEFAULT 'teal',
  email VARCHAR(255) UNIQUE,
  password VARCHAR(255)
);

-- Create visited_countries table
CREATE TABLE visited_countries(
  id SERIAL PRIMARY KEY,
  country_code CHAR(2) NOT NULL,
  user_id INTEGER REFERENCES users(id)
);

-- Create image_table
CREATE TABLE image_table (
  id SERIAL PRIMARY KEY,
  country_code CHAR(2) NOT NULL,
  image VARCHAR(500) NOT NULL,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert some sample data if you want
-- INSERT INTO users (name, color, email, password) 
-- VALUES ('Test User', 'teal', 'test@example.com', '$2a$10$test.hash.here');

-- Note: The password above is just a placeholder. Real passwords will be hashed by bcrypt.

COMMIT;
