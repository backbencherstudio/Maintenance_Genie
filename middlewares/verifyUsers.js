import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();


export const verifyUser = (...allowedRoles) => {
  return (req, res, next) => {
    const authHeader = req.headers["authorization"];

    if (!authHeader) {
      res.status(401).json({ message: "No token provided" });
      return;
    }

    try {
      const token = authHeader;
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;

      if (
        allowedRoles.length &&
        !allowedRoles.includes("ANY") &&
        !allowedRoles.includes(req.user?.role)
      ) {
        res
          .status(403)
          .json({ message: "Access denied. Insufficient permission." });
        return;
      }

      next();
    } catch (error) {
      res.status(401).json({ message: "Invalid or expired token" });
      return;
    }
  };
};