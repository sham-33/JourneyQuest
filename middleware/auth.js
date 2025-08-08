import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Middleware to verify JWT token
export const authenticateToken = (req, res, next) => {
  const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.redirect('/auth/login');
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.redirect('/auth/login');
    }
    req.user = user;
    next();
  });
};

// Middleware to check if user is already logged in
export const checkAuthStatus = (req, res, next) => {
  const token = req.cookies.token;
  
  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (!err) {
        req.user = user;
      }
    });
  }
  next();
};

// Generate JWT token
export const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      name: user.name, 
      email: user.email 
    }, 
    JWT_SECRET, 
    { expiresIn: '24h' }
  );
};
