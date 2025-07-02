import { verify } from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const verifyUser = async (req, res, next) => {
  const { token } = req.cookies;
  const JWT_SECRET = process.env.WEBTOKEN_SECRET_KEY;

  if (!token) {
    res.status(400).json({
      message: 'Unauthorized user',
    });
    return;
  }

  try {
    // Decode the token and extract the userId
    const decodedToken = verify(token, JWT_SECRET);

    req.userId = decodedToken.userId;
    console.log(decodedToken?.role);

    // Check if the token is valid and the user exists (this can be expanded as needed)
    if (!decodedToken.userId) {
      res.status(401).json({ message: 'Invalid token' });
      return;
    }

    next(); // If the token is valid, proceed to the next middleware
  } catch (error) {
    res.status(401).json({ message: 'Invalid or expired token' });
    return;
  }
};

export { verifyUser };
