import jwt from "jsonwebtoken";

export const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: payload.sub,
      email: payload.email,
      // company JWTs embed companyId — capture it so routes can enforce tenant isolation
      companyId: payload.companyId != null ? parseInt(payload.companyId, 10) : null,
      // company JWTs embed role — capture it so RBAC (requirePermission) can resolve access
      role: payload.role ?? null,
    };
    return next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
