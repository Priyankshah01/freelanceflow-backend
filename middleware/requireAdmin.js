// middleware/requireAdmin.js
module.exports = (req, res, next) => {
  try {
    // If you already attach user via a JWT middleware, check it here.
    // For dev, allow when there's any Authorization header.
    const auth = req.get("authorization") || "";
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    // If you have roles on req.user, enforce admin here:
    // if (!req.user || req.user.role !== "admin") {
    //   return res.status(403).json({ error: "Forbidden" });
    // }

    next();
  } catch (e) {
    next(e);
  }
};
