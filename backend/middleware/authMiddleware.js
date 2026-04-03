const logger = require('../utils/logger');

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided. Authorization denied.' });
    }

    const token = authHeader.split(' ')[1];
    let decodedToken;
    try {
      decodedToken = await global.adminAuth.verifyIdToken(token);
    } catch (err) {
      if (err.code === 'auth/id-token-expired') {
        return res.status(401).json({ success: false, message: 'Token has expired. Please log in again.' });
      }
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }

    // Lookup user in Firestore
    const userDoc = await global.db.collection('users').doc(decodedToken.uid).get();
    if (!userDoc.exists) {
      return res.status(401).json({ success: false, message: 'Token is valid but user no longer exists in DB.' });
    }

    const userData = userDoc.data();
    if (!userData.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated. Contact admin.' });
    }

    req.user = { _id: decodedToken.uid, uid: decodedToken.uid, ...userData };
    
    // Support legacy _id based references across old codebase while passing
    req.user._id = decodedToken.uid; 
    
    next();
  } catch (err) {
    logger.warn(`Auth middleware error: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Internal Server Error during auth.' });
  }
};

module.exports = { protect };
