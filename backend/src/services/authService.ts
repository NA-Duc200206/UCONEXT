import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import { User, AuditLog } from '../models';
import { emailService } from './emailService';

function getFirebaseAdminAuth() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    const error: any = new Error('Firebase Authentication is not configured on the server (missing FIREBASE_PROJECT_ID).');
    error.statusCode = 500;
    throw error;
  }

  const app = getApps().length > 0 ? getApp() : initializeApp({ projectId });
  return getAuth(app);
}

function mapFirebaseProvider(
  signInProvider?: string
): 'google' | 'facebook' | 'github' | 'apple' | 'phone' | 'firebase' {
  switch (signInProvider) {
    case 'google.com':
      return 'google';
    case 'facebook.com':
      return 'facebook';
    case 'github.com':
      return 'github';
    case 'apple.com':
      return 'apple';
    case 'phone':
      return 'phone';
    default:
      return 'firebase';
  }
}

const BCRYPT_SALT_ROUNDS = 12;
const RESET_TOKEN_TTL_MINUTES = 15;
const MAX_REFRESH_SESSIONS = 5;

function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'super_secret_jwt_key_glowstore_2026';
}

function getJwtRefreshSecret(): string {
  return process.env.JWT_REFRESH_SECRET || getJwtSecret();
}

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function signAccessToken(user: any): string {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    getJwtSecret(),
    { expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || '1h') as jwt.SignOptions['expiresIn'] }
  );
}

function signRefreshToken(user: any): string {
  return jwt.sign(
    { id: user._id, type: 'refresh', jti: crypto.randomBytes(12).toString('hex') },
    getJwtRefreshSecret(),
    { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'] }
  );
}

async function issueAuthTokens(user: any, replaceHashedRefreshToken?: string) {
  const token = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const hashedRefresh = hashToken(refreshToken);

  const existingTokens: string[] = Array.isArray(user.refreshTokens) ? user.refreshTokens : [];
  const filteredTokens = replaceHashedRefreshToken
    ? existingTokens.filter((t) => t !== replaceHashedRefreshToken)
    : existingTokens;

  user.refreshTokens = [...filteredTokens, hashedRefresh].slice(-MAX_REFRESH_SESSIONS);
  await user.save();

  return { token, refreshToken };
}

function validatePasswordStrength(password: string) {
  if (!password || password.length < 8 || password.length > 128) {
    const error: any = new Error('Password must be between 8 and 128 characters.');
    error.statusCode = 400;
    throw error;
  }
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
    const error: any = new Error('Password must include at least one uppercase letter, one lowercase letter, and one number.');
    error.statusCode = 400;
    throw error;
  }
}

function sanitizeUser(userDoc: any) {
  const obj = typeof userDoc.toObject === 'function' ? userDoc.toObject() : { ...userDoc };
  delete obj.password;
  delete obj.refreshTokens;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  return {
    ...obj,
    id: obj._id
  };
}

export const authService = {
  async login(email: string, password: string, ipAddress: string) {
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      const error: any = new Error('Email and password are required.');
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findOne({ email: normalizedEmail }).select('+password +refreshTokens');
    if (!user) {
      const error: any = new Error('Incorrect email or password.');
      error.statusCode = 400;
      throw error;
    }

    if (!user.password) {
      const error: any = new Error('This account uses Google Sign-In. Please continue with Google or reset your password.');
      error.statusCode = 400;
      throw error;
    }

    const isMatch = await bcrypt.compare(password, user.password || '');
    if (!isMatch) {
      const error: any = new Error('Incorrect email or password.');
      error.statusCode = 400;
      throw error;
    }

    const { token, refreshToken } = await issueAuthTokens(user);
    const formattedUser = sanitizeUser(user);

    try {
      await AuditLog.create({
        userId: user._id as any,
        action: 'LOGIN',
        targetType: 'User',
        targetId: user._id.toString(),
        ipAddress: ipAddress || ''
      });
    } catch (logErr) {
      console.error('Failed to create login audit log:', logErr);
    }

    return { token, refreshToken, user: formattedUser };
  },

  async register(name: string, email: string, password: string, ipAddress: string) {
    const trimmedName = name?.trim();
    const normalizedEmail = email?.trim().toLowerCase();
    if (!trimmedName || !normalizedEmail || !password) {
      const error: any = new Error('Please fill in all fields.');
      error.statusCode = 400;
      throw error;
    }

    validatePasswordStrength(password);

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      const error: any = new Error('Email already exists.');
      error.statusCode = 400;
      throw error;
    }

    const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name: trimmedName,
      email: normalizedEmail,
      password: hashedPassword,
      role: 'customer'
    });

    const { token, refreshToken } = await issueAuthTokens(user);
    const formattedUser = sanitizeUser(user);

    try {
      await AuditLog.create({
        userId: user._id as any,
        action: 'REGISTER',
        targetType: 'User',
        targetId: user._id.toString(),
        ipAddress: ipAddress || ''
      });
    } catch (logErr) {
      console.error('Failed to create registration audit log:', logErr);
    }

    return { token, refreshToken, user: formattedUser };
  },

  async getProfile(userDoc: any) {
    const userObj = userDoc.toObject();
    delete userObj.password;
    return {
      ...userObj,
      id: userObj._id
    };
  },

  async syncCart(userDoc: any, cart: any[]) {
    if (!cart || !Array.isArray(cart)) {
      const error: any = new Error('Cart items must be an array.');
      error.statusCode = 400;
      throw error;
    }

    userDoc.cart = cart;
    await userDoc.save();
    return true;
  },

  async getAllUsers() {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    return users.map(u => ({
      ...u.toObject(),
      id: u._id
    }));
  },

  async updateUserRole(userId: string, role: string) {
    const validRoles = ['customer', 'admin', 'warehouse', 'support'];
    if (!validRoles.includes(role)) {
      const error: any = new Error('Invalid role specified.');
      error.statusCode = 400;
      throw error;
    }
    const user = await User.findByIdAndUpdate(userId, { role }, { new: true }).select('-password');
    if (!user) {
      const error: any = new Error('User not found.');
      error.statusCode = 404;
      throw error;
    }
    return {
      ...user.toObject(),
      id: user._id
    };
  },

  async updateProfile(userDoc: any, data: { name?: string; avatar?: string }) {
    if (data.name !== undefined) {
      const trimmedName = String(data.name).trim();
      if (trimmedName.length < 2 || trimmedName.length > 80) {
        const error: any = new Error('Name must be between 2 and 80 characters.');
        error.statusCode = 400;
        throw error;
      }
      userDoc.name = trimmedName;
    }

    if (data.avatar !== undefined) {
      const trimmedAvatar = String(data.avatar).trim();
      if (trimmedAvatar.length > 500) {
        const error: any = new Error('Avatar URL is too long.');
        error.statusCode = 400;
        throw error;
      }
      userDoc.avatar = trimmedAvatar;
    }

    await userDoc.save();
    const obj = userDoc.toObject();
    delete obj.password;
    return {
      ...obj,
      id: obj._id
    };
  },

  async changePassword(userDoc: any, data: { currentPassword?: string; newPassword?: string }) {
    const currentPassword = data?.currentPassword || '';
    const newPassword = data?.newPassword || '';

    if (!currentPassword || !newPassword) {
      const error: any = new Error('Current password and new password are required.');
      error.statusCode = 400;
      throw error;
    }

    validatePasswordStrength(newPassword);

    if (currentPassword === newPassword) {
      const error: any = new Error('New password must be different from your current password.');
      error.statusCode = 400;
      throw error;
    }

    const userWithPassword = await User.findById(userDoc._id).select('+password');
    if (!userWithPassword) {
      const error: any = new Error('User not found.');
      error.statusCode = 404;
      throw error;
    }

    const isMatch = await bcrypt.compare(currentPassword, userWithPassword.password || '');
    if (!isMatch) {
      const error: any = new Error('Current password is incorrect.');
      error.statusCode = 400;
      throw error;
    }

    const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
    userWithPassword.password = await bcrypt.hash(newPassword, salt);
    await userWithPassword.save();

    try {
      await AuditLog.create({
        userId: userDoc._id as any,
        action: 'CHANGE_PASSWORD',
        targetType: 'User',
        targetId: userDoc._id.toString(),
        ipAddress: ''
      });
    } catch (logErr) {
      console.error('Failed to create password change audit log:', logErr);
    }

    return true;
  },

  async refreshSession(rawRefreshToken: string) {
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
      const error: any = new Error('Refresh token is required.');
      error.statusCode = 401;
      throw error;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(rawRefreshToken, getJwtRefreshSecret());
    } catch {
      const error: any = new Error('Refresh token is invalid or expired.');
      error.statusCode = 401;
      throw error;
    }

    if (!decoded?.id || decoded.type !== 'refresh') {
      const error: any = new Error('Invalid refresh token payload.');
      error.statusCode = 401;
      throw error;
    }

    const user = await User.findById(decoded.id).select('+refreshTokens');
    const hashedIncoming = hashToken(rawRefreshToken);

    if (!user || !Array.isArray(user.refreshTokens) || !user.refreshTokens.includes(hashedIncoming)) {
      const error: any = new Error('Refresh token has been revoked.');
      error.statusCode = 401;
      throw error;
    }

    const { token, refreshToken } = await issueAuthTokens(user, hashedIncoming);
    return { token, refreshToken, user: sanitizeUser(user) };
  },

  async logout(rawRefreshToken?: string) {
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
      return true;
    }

    try {
      const decoded: any = jwt.verify(rawRefreshToken, getJwtRefreshSecret());
      if (decoded?.id) {
        await User.updateOne(
          { _id: decoded.id },
          { $pull: { refreshTokens: hashToken(rawRefreshToken) } }
        );
      }
    } catch {
      // Best-effort cleanup; ignore expired or malformed tokens on logout
    }
    return true;
  },

  async forgotPassword(email: string, clientOrigin?: string) {
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      const error: any = new Error('Please enter a valid email address.');
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findOne({ email: normalizedEmail }).select('+resetPasswordToken +resetPasswordExpires');
    if (!user) {
      // Do not leak whether an account exists
      return true;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = hashToken(rawToken);
    user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
    await user.save();

    const baseClientUrl = (process.env.CLIENT_URL || clientOrigin || 'http://localhost:3000').replace(/\/+$/, '');
    const resetUrl = `${baseClientUrl}/reset-password?token=${rawToken}`;

    await emailService.sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl,
      expiresInMinutes: RESET_TOKEN_TTL_MINUTES
    });

    return true;
  },

  async resetPassword(rawToken: string, newPassword: string, ipAddress = '') {
    const token = rawToken?.trim();
    if (!token) {
      const error: any = new Error('Password reset token is required.');
      error.statusCode = 400;
      throw error;
    }

    validatePasswordStrength(newPassword);

    const hashedToken = hashToken(token);
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() }
    }).select('+password +refreshTokens +resetPasswordToken +resetPasswordExpires');

    if (!user) {
      const error: any = new Error('Password reset link is invalid or has expired.');
      error.statusCode = 400;
      throw error;
    }

    const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.refreshTokens = [];
    await user.save();

    try {
      await AuditLog.create({
        userId: user._id as any,
        action: 'RESET_PASSWORD',
        targetType: 'User',
        targetId: user._id.toString(),
        ipAddress: ipAddress || ''
      });
    } catch (logErr) {
      console.error('Failed to create password reset audit log:', logErr);
    }

    return true;
  },

  async loginWithGoogle(payload: { accessToken?: string; idToken?: string }, ipAddress = '') {
    const accessToken = payload?.accessToken?.trim();
    const idToken = payload?.idToken?.trim();

    if (!accessToken && !idToken) {
      const error: any = new Error('Google authentication token is required.');
      error.statusCode = 400;
      throw error;
    }

    let googleProfile: {
      sub: string;
      email: string;
      email_verified?: boolean | string;
      name?: string;
      picture?: string;
      aud?: string;
    };

    if (idToken) {
      const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
      if (!verifyRes.ok) {
        const error: any = new Error('Invalid or expired Google ID token.');
        error.statusCode = 401;
        throw error;
      }
      googleProfile = (await verifyRes.json()) as any;
      if (process.env.GOOGLE_CLIENT_ID && googleProfile.aud !== process.env.GOOGLE_CLIENT_ID) {
        const error: any = new Error('Google token audience mismatch.');
        error.statusCode = 401;
        throw error;
      }
    } else {
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!userInfoRes.ok) {
        const error: any = new Error('Invalid or expired Google access token.');
        error.statusCode = 401;
        throw error;
      }
      googleProfile = (await userInfoRes.json()) as any;
    }

    const isVerified = googleProfile.email_verified === true || googleProfile.email_verified === 'true';
    const normalizedEmail = googleProfile.email?.trim().toLowerCase();
    if (!normalizedEmail || !isVerified) {
      const error: any = new Error('Google account email is not verified.');
      error.statusCode = 400;
      throw error;
    }

    let user = await User.findOne({
      $or: [{ googleId: googleProfile.sub }, { email: normalizedEmail }]
    }).select('+refreshTokens');

    let auditAction = 'GOOGLE_LOGIN';
    if (!user) {
      auditAction = 'GOOGLE_REGISTER';
      user = await User.create({
        name: googleProfile.name?.trim() || normalizedEmail.split('@')[0],
        email: normalizedEmail,
        googleId: googleProfile.sub,
        authProvider: 'google',
        avatar: googleProfile.picture || undefined,
        role: 'customer'
      });
    } else {
      let changed = false;
      if (!user.googleId && googleProfile.sub) {
        user.googleId = googleProfile.sub;
        changed = true;
      }
      if (!user.avatar && googleProfile.picture) {
        user.avatar = googleProfile.picture;
        changed = true;
      }
      if (changed) {
        await user.save();
      }
    }

    const { token, refreshToken } = await issueAuthTokens(user);
    const formattedUser = sanitizeUser(user);

    try {
      await AuditLog.create({
        userId: user._id as any,
        action: auditAction,
        targetType: 'User',
        targetId: user._id.toString(),
        ipAddress: ipAddress || ''
      });
    } catch (logErr) {
      console.error('Failed to create Google auth audit log:', logErr);
    }

    return { token, refreshToken, user: formattedUser };
  },

  async loginWithFirebase(idToken: string, ipAddress = '') {
    const cleanToken = idToken?.trim();
    if (!cleanToken) {
      const error: any = new Error('Firebase ID token is required.');
      error.statusCode = 400;
      throw error;
    }

    let decoded: DecodedIdToken;
    try {
      decoded = await getFirebaseAdminAuth().verifyIdToken(cleanToken);
    } catch (err: any) {
      if (err?.statusCode === 500) throw err;
      const error: any = new Error('Invalid or expired Firebase authentication token.');
      error.statusCode = 401;
      throw error;
    }

    const normalizedEmail = decoded.email?.trim().toLowerCase();
    const phone = decoded.phone_number?.trim();
    const provider = mapFirebaseProvider(decoded.firebase?.sign_in_provider);

    if (!normalizedEmail && !phone) {
      const error: any = new Error('Authenticated account must provide an email address or phone number.');
      error.statusCode = 400;
      throw error;
    }

    const queryOr: any[] = [{ firebaseUid: decoded.uid }];
    if (normalizedEmail) queryOr.push({ email: normalizedEmail });
    if (phone) queryOr.push({ phone });

    let user = await User.findOne({ $or: queryOr }).select('+refreshTokens');
    let auditAction = 'SOCIAL_LOGIN';

    if (!user) {
      auditAction = 'SOCIAL_REGISTER';
      const fallbackEmail = normalizedEmail || `${decoded.uid}@phone.uconext.local`;
      user = await User.create({
        name: decoded.name?.trim() || (normalizedEmail ? normalizedEmail.split('@')[0] : phone || 'UCONEXT User'),
        email: fallbackEmail,
        firebaseUid: decoded.uid,
        phone: phone || undefined,
        authProvider: provider,
        avatar: decoded.picture || undefined,
        role: 'customer'
      });
    } else {
      let changed = false;
      if (!user.firebaseUid) {
        user.firebaseUid = decoded.uid;
        changed = true;
      }
      if (!user.phone && phone) {
        user.phone = phone;
        changed = true;
      }
      if (!user.avatar && decoded.picture) {
        user.avatar = decoded.picture;
        changed = true;
      }
      if (changed) {
        await user.save();
      }
    }

    const { token, refreshToken } = await issueAuthTokens(user);
    const formattedUser = sanitizeUser(user);

    try {
      await AuditLog.create({
        userId: user._id as any,
        action: auditAction,
        targetType: 'User',
        targetId: user._id.toString(),
        ipAddress: ipAddress || ''
      });
    } catch (logErr) {
      console.error('Failed to create Firebase auth audit log:', logErr);
    }

    return { token, refreshToken, user: formattedUser };
  }
};
