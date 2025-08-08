import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import multer from "multer";
import env from "dotenv";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import session from "express-session";
import { authenticateToken, checkAuthStatus, generateToken } from "./middleware/auth.js";

const app = express();
const port = 3001;
env.config();

//uploading file

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    return cb(null, "./uploads");
  },
  filename: function (req, file, cb) {
    return cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

const db = new pg.Client({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "world",
  password: process.env.DB_PASSWORD || "123456789",
  port: process.env.DB_PORT || 5432,
});

// Initialize database connection and setup
async function initializeDatabase() {
  try {
    await db.connect();
    
    // First, check if users table exists and fix the id column
    try {
      // Check if the id column is properly set up as SERIAL
      const checkSerial = await db.query(`
        SELECT column_default 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'id'
      `);
      
      if (checkSerial.rows.length === 0 || !checkSerial.rows[0].column_default?.includes('nextval')) {
        console.log('Fixing users table id column...');
        
        // Drop and recreate the users table with proper SERIAL id
        await db.query(`DROP TABLE IF EXISTS visited_countries CASCADE`);
        await db.query(`DROP TABLE IF EXISTS image_table CASCADE`);
        await db.query(`DROP TABLE IF EXISTS users CASCADE`);
        
        // Recreate users table with proper SERIAL id
        await db.query(`
          CREATE TABLE users(
            id SERIAL PRIMARY KEY,
            name VARCHAR(15) UNIQUE NOT NULL,
            color VARCHAR(15),
            email VARCHAR(255) UNIQUE,
            password VARCHAR(255)
          )
        `);
        
        // Recreate visited_countries table
        await db.query(`
          CREATE TABLE visited_countries(
            id SERIAL PRIMARY KEY,
            country_code CHAR(2) NOT NULL,
            user_id INTEGER REFERENCES users(id)
          )
        `);
        
        // Recreate image_table
        await db.query(`
          CREATE TABLE IF NOT EXISTS image_table (
            id SERIAL PRIMARY KEY,
            country_code CHAR(2) NOT NULL,
            image VARCHAR(500) NOT NULL,
            user_id INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        console.log('Users table recreated with proper SERIAL id');
      } else {
        // Just add email and password columns if they don't exist
        await db.query(`
          ALTER TABLE users 
          ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE,
          ADD COLUMN IF NOT EXISTS password VARCHAR(255)
        `);
      }
    } catch (error) {
      console.log('Creating fresh database tables...');
      
      // Create users table with proper SERIAL id
      await db.query(`
        CREATE TABLE IF NOT EXISTS users(
          id SERIAL PRIMARY KEY,
          name VARCHAR(15) UNIQUE NOT NULL,
          color VARCHAR(15),
          email VARCHAR(255) UNIQUE,
          password VARCHAR(255)
        )
      `);
      
      // Create other tables
      await db.query(`
        CREATE TABLE IF NOT EXISTS visited_countries(
          id SERIAL PRIMARY KEY,
          country_code CHAR(2) NOT NULL,
          user_id INTEGER REFERENCES users(id)
        )
      `);
    }
    
    // Create image_table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS image_table (
        id SERIAL PRIMARY KEY,
        country_code CHAR(2) NOT NULL,
        image VARCHAR(500) NOT NULL,
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Database initialization error:", error);
  }
}

initializeDatabase();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true in production with HTTPS
}));
app.use(express.static("public"));
app.use(express.static("uploads"));

let currentUserId = 1;
let users = [
  // { id: 1, name: "Angela", color: "teal" },
  // { id: 2, name: "Jack", color: "powderblue" },
];
let images = [];
let ratingsarray = [];

async function checkVisisted() {
  const result = await db.query(
    "SELECT country_code FROM visited_countries JOIN users ON users.id = user_id WHERE user_id = $1; ",
    [currentUserId]
  );
  let countries = [];
  result.rows.forEach((country) => {
    countries.push(country.country_code);
  });
  return countries;
}

async function checkVisitedByUser(userId) {
  const result = await db.query(
    "SELECT country_code FROM visited_countries JOIN users ON users.id = user_id WHERE user_id = $1; ",
    [userId]
  );
  let countries = [];
  result.rows.forEach((country) => {
    countries.push(country.country_code);
  });
  return countries;
}

async function getcurrentuser() {
  const result = await db.query("SELECT * FROM users WHERE id = $1", [currentUserId]);
  return result.rows[0];
}

async function getUserById(userId) {
  const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);
  return result.rows[0];
}

async function getimages(user_id, country_code) {
  const result = await db.query(
    "SELECT * from image_table where user_id=$1 and country_code=$2",
    [user_id, country_code]
  );
  images = result.rows;
  return images;
}

async function getratedcountries() {
  try {
    // For now, just return an empty array since we don't have ratings table
    // You can implement this later if needed
    return [];
  } catch (error) {
    console.error('Error getting rated countries:', error);
    return [];
  }
}

app.get("/", checkAuthStatus, async (req, res) => {
  res.render("frontend.ejs", { user: req.user });
});

app.get("/dashboard", authenticateToken, async (req, res) => {
  try {
    const currentuser = await getUserById(req.user.id);
    if (!currentuser) {
      return res.redirect('/auth/login');
    }
    
    const countries = await checkVisitedByUser(req.user.id);
    const allUsers = await db.query("SELECT * FROM users");
    
    res.render("dashboard.ejs", {
      countries: countries,
      total: countries.length,
      users: allUsers.rows,
      color: currentuser.color,
      currentUser: currentuser
    });
  } catch (error) {
    console.error('Error in /dashboard:', error);
    res.redirect('/auth/login');
  }
});

// Authentication Routes
app.get("/auth/login", (req, res) => {
  res.render("login.ejs", { error: null });
});

app.get("/auth/register", (req, res) => {
  res.render("register.ejs", { error: null });
});

app.post("/auth/register", async (req, res) => {
  const { name, email, password, confirmPassword, color } = req.body;
  
  try {
    // Validate passwords match
    if (password !== confirmPassword) {
      return res.render("register.ejs", { error: "Passwords do not match" });
    }
    
    // Check if user already exists
    const existingUser = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    if (existingUser.rows.length > 0) {
      return res.render("register.ejs", { error: "User with this email already exists" });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insert user into database
    const result = await db.query(
      "INSERT INTO users (name, email, password, color) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, email, hashedPassword, color || 'teal']
    );
    
    const user = result.rows[0];
    
    // Generate JWT token
    const token = generateToken(user);
    
    // Set cookie and redirect
    res.cookie('token', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }); // 24 hours
    res.redirect('/getstart');
    
  } catch (error) {
    console.error('Registration error:', error);
    res.render("register.ejs", { error: "Registration failed. Please try again." });
  }
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  
  try {
    // Find user by email
    const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    
    if (result.rows.length === 0) {
      return res.render("login.ejs", { error: "Invalid email or password" });
    }
    
    const user = result.rows[0];
    
    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.render("login.ejs", { error: "Invalid email or password" });
    }
    
    // Generate JWT token
    const token = generateToken(user);
    
    // Set cookie and redirect
    res.cookie('token', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }); // 24 hours
    res.redirect('/getstart');
    
  } catch (error) {
    console.error('Login error:', error);
    res.render("login.ejs", { error: "Login failed. Please try again." });
  }
});

app.post("/auth/logout", (req, res) => {
  res.clearCookie('token');
  res.redirect('/');
});

app.get("/images", async (req, res) => {
  try {
    const images = await db.query("SELECT * FROM image_table ORDER BY created_at DESC");
    const cratings = await getratedcountries();
    res.render("gallery.ejs", {
      users: images.rows,
      ratings: cratings,
    });
  } catch (error) {
    console.error('Error loading gallery:', error);
    res.render("gallery.ejs", {
      users: [],
      ratings: [],
    });
  }
});

app.get("/login", async (req, res) => {
  res.redirect("/auth/login");
});

app.post("/upload", authenticateToken, upload.single("Uploadimage"), async (req, res) => {
  console.log(req.file);
  const country = req.body["country"];
  const userId = req.user.id;

  try {
    const result = await db.query(
      "SELECT country_code from countries where LOWER(country_name) LIKE $1 || '%' ;",
      [country.toLowerCase()]
    );
    
    if (result.rows.length === 0) {
      throw new Error("Country not found");
    }
    
    const countryCode = result.rows[0].country_code;
    
    await db.query(
      "INSERT INTO image_table (country_code,image,user_id) VALUES ($1, $2, $3)",
      [countryCode, req.file.path, userId]
    );
    
    res.redirect("/dashboard");
  } catch (error) {
    console.log("Upload error:", error.message);
    res.redirect("/?error=upload_failed");
  }
});

app.post("/getimages", async (req, res) => {
  const inputuser = req.body["user"];
  const inputcountry = req.body["country"];
  try {
    const result = await db.query(
      "SELECT country_code from countries where LOWER(country_name) LIKE $1 || '%' ;",
      [inputcountry.toLowerCase()]
    );
    const result1 = await db.query(
      "SELECT id from users where LOWER(name) LIKE $1 || '%' ;",
      [inputuser.toLowerCase()]
    );
    try {
      const data = result.rows[0];
      const countryCode = data.country_code;
      const data1 = result1.rows[0];
      const user_id = data1.id;
      const usersimage = await getimages(user_id, countryCode);
      console.log(usersimage);
      res.render("images.ejs", {
        users: usersimage,
        ratings: ratingsarray,
      });
    } catch {
      console.log("Cannot get the images");
    }
  } catch {
    console.log("User has not visited the country");
  }
});

app.get("/getstart", authenticateToken, async (req, res) => {
  res.redirect('/dashboard');
});

// API endpoints for AJAX requests
app.post("/api/add-country", authenticateToken, async (req, res) => {
  const input = req.body.country;
  const userId = req.user.id;

  try {
    const result = await db.query(
      "SELECT country_code FROM countries WHERE LOWER(country_name) LIKE  $1 || '%' ;",
      [input.toLowerCase()]
    );

    const data = result.rows[0];
    const countryCode = data.country_code;
    
    try {
      await db.query(
        "INSERT INTO visited_countries (country_code,user_id) VALUES ($1, $2)",
        [countryCode, userId]
      );
      
      const countries = await checkVisitedByUser(userId);
      
      res.json({
        success: true,
        message: `${input} added successfully!`,
        countryCode: countryCode,
        total: countries.length
      });
    } catch (err) {
      console.log(err);
      res.json({
        success: false,
        message: "Country is already visited, try again."
      });
    }
  } catch (err) {
    console.log(err);
    res.json({
      success: false,
      message: "Country does not exist, try again."
    });
  }
});

app.post("/api/remove-country", authenticateToken, async (req, res) => {
  const input = req.body.country;
  const userId = req.user.id;
  
  try {
    const result = await db.query(
      "SELECT country_code FROM countries WHERE LOWER(country_name) LIKE  $1 || '%' ;",
      [input.toLowerCase()]
    );

    const data = result.rows[0];
    const countryCode = data.country_code;
    
    try {
      const deleteResult = await db.query(
        "DELETE FROM visited_countries WHERE country_code=$1 AND user_id=$2",
        [countryCode, userId]
      );
      
      if (deleteResult.rowCount === 0) {
        res.json({
          success: false,
          message: "Country is not in your visited list."
        });
      } else {
        const countries = await checkVisitedByUser(userId);
        
        res.json({
          success: true,
          message: `${input} removed successfully!`,
          countryCode: countryCode,
          total: countries.length
        });
      }
    } catch (err) {
      console.log(err);
      res.json({
        success: false,
        message: "Error removing country."
      });
    }
  } catch (err) {
    console.log(err);
    res.json({
      success: false,
      message: "Country does not exist, try again."
    });
  }
});

app.post("/add", authenticateToken, async (req, res) => {
  const input = req.body["country"];
  const userId = req.user.id;

  try {
    const result = await db.query(
      "SELECT country_code FROM countries WHERE LOWER(country_name) LIKE  $1 || '%' ;",
      [input.toLowerCase()]
    );

    const data = result.rows[0];
    const countryCode = data.country_code;
    try {
      await db.query(
        "INSERT INTO visited_countries (country_code,user_id) VALUES ($1, $2)",
        [countryCode, userId]
      );
      res.redirect("/dashboard");
    } catch (err) {
      console.log(err);
      const countries = await checkVisitedByUser(userId);
      const currentuser = await getUserById(userId);
      const allUsers = await db.query("SELECT * FROM users");
      res.render("dashboard.ejs", {
        countries: countries,
        total: countries.length,
        users: allUsers.rows,
        color: currentuser.color,
        currentUser: currentuser,
        error: "Country is already visited try again.",
      });
    }
  } catch (err) {
    console.log(err);
    const countries = await checkVisitedByUser(userId);
    const currentuser = await getUserById(userId);
    const allUsers = await db.query("SELECT * FROM users");
    res.render("dashboard.ejs", {
      countries: countries,
      total: countries.length,
      users: allUsers.rows,
      color: currentuser.color,
      currentUser: currentuser,
      error: " country does not exits try again.",
    });
  }
});


app.post("/delete", authenticateToken, async (req, res) => {
  const input = req.body["country"];
  const userId = req.user.id;
  
  try {
    const result = await db.query(
      "SELECT country_code FROM countries WHERE LOWER(country_name) LIKE  $1 || '%' ;",
      [input.toLowerCase()]
    );

    const data = result.rows[0];
    const countryCode = data.country_code;
    try {
      await db.query(
        "DELETE FROM visited_countries WHERE country_code=$1 AND user_id=$2",
        [countryCode, userId]
      );
      res.redirect("/dashboard");
    } catch (err) {
      console.log(err);
      const countries = await checkVisitedByUser(userId);
      const currentuser = await getUserById(userId);
      const allUsers = await db.query("SELECT * FROM users");
      res.render("dashboard.ejs", {
        countries: countries,
        total: countries.length,
        users: allUsers.rows,
        color: currentuser.color,
        currentUser: currentuser,
        error: "Country is not visited try again.",
      });
    }
  } catch (err) {
    console.log(err);
    const countries = await checkVisitedByUser(userId);
    const currentuser = await getUserById(userId);
    const allUsers = await db.query("SELECT * FROM users");
    res.render("dashboard.ejs", {
      countries: countries,
      total: countries.length,
      users: allUsers.rows,
      color: currentuser.color,
      currentUser: currentuser,
      error: " country does not exits try again.",
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
