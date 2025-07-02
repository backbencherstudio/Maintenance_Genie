import { verify } from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const authUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Check if the authorization header exists and starts with "Bearer"
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication invalid' });
  }

  const token = authHeader.split(' ')[1];  // Extract the token from "Bearer <token>"

  console.log("Token from header:", token);
  const JWT_SECRET = process.env.WEBTOKEN_SECRET_KEY;

  if (!token) {
    return res.status(400).json({
      message: 'Unauthorized user',
    });
  }

  try {
    const decodedToken = verify(token, JWT_SECRET);
    req.userId = decodedToken.userId;
    console.log("Decoded Token:", decodedToken);
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
    return;
  }
};

export { authUser };
