import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User, AuditLog, Category, Product } from '../models';

const BCRYPT_SALT_ROUNDS = 12;
const PHONE_REGEX = /^[0-9+\-\s()]{8,20}$/;

function createHttpError(message: string, statusCode: number) {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validatePasswordStrength(password: string) {
  if (!password || password.length < 8 || password.length > 128) {
    throw createHttpError('Password must be between 8 and 128 characters.', 400);
  }
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
    throw createHttpError('Password must include at least one uppercase letter, one lowercase letter, and one number.', 400);
  }
}

function sanitizeUser(userDoc: any) {
  const obj = typeof userDoc.toObject === 'function' ? userDoc.toObject() : { ...userDoc };
  delete obj.password;
  delete obj.refreshTokens;
  return {
    ...obj,
    preferredCategories: Array.isArray(obj.preferredCategories) ? obj.preferredCategories : [],
    recentlyViewed: Array.isArray(obj.recentlyViewed) ? obj.recentlyViewed : [],
    savedAddresses: Array.isArray(obj.savedAddresses) ? obj.savedAddresses : [],
    id: obj._id
  };
}

function validateAddressPayload(data: any, isPartial = false) {
  const result: { label?: string; fullName?: string; phone?: string; address?: string } = {};

  if (!isPartial || data?.label !== undefined) {
    const rawLabel = data?.label === undefined ? '' : String(data.label).trim();
    const label = !isPartial && !rawLabel ? 'Home' : rawLabel;
    if (label.length < 1 || label.length > 40) {
      throw createHttpError('Address label must be between 1 and 40 characters.', 400);
    }
    result.label = label;
  }

  if (!isPartial || data?.fullName !== undefined) {
    const fullName = String(data?.fullName ?? '').trim();
    if (fullName.length < 2 || fullName.length > 80) {
      throw createHttpError('Recipient full name must be between 2 and 80 characters.', 400);
    }
    result.fullName = fullName;
  }

  if (!isPartial || data?.phone !== undefined) {
    const phone = String(data?.phone ?? '').trim();
    if (!PHONE_REGEX.test(phone)) {
      throw createHttpError('Please enter a valid phone number (8-20 characters).', 400);
    }
    result.phone = phone;
  }

  if (!isPartial || data?.address !== undefined) {
    const address = String(data?.address ?? '').trim();
    if (address.length < 5 || address.length > 300) {
      throw createHttpError('Shipping address must be between 5 and 300 characters.', 400);
    }
    result.address = address;
  }

  return result;
}

export const authService = {
  async login(email: string, password: string, ipAddress: string) {
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      const error: any = new Error('Email and password are required.');
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user) {
      const error: any = new Error('Incorrect email or password.');
      error.statusCode = 400;
      throw error;
    }

    const isMatch = await bcrypt.compare(password, user.password || '');
    if (!isMatch) {
      const error: any = new Error('Incorrect email or password.');
      error.statusCode = 400;
      throw error;
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'super_secret_jwt_key_glowstore_2026',
      { expiresIn: '24h' }
    );

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

    return { token, user: formattedUser };
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

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'super_secret_jwt_key_glowstore_2026',
      { expiresIn: '24h' }
    );

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

    return { token, user: formattedUser };
  },

  async getProfile(userDoc: any) {
    return sanitizeUser(userDoc);
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
    return sanitizeUser(userDoc);
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

  async updatePreferences(userDoc: any, preferredCategories: unknown) {
    if (!Array.isArray(preferredCategories)) {
      throw createHttpError('preferredCategories must be an array.', 400);
    }

    const rawIds = preferredCategories.map((id) => String(id ?? '').trim());
    for (const id of rawIds) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw createHttpError('One or more category IDs are invalid.', 400);
      }
    }

    const uniqueIds = Array.from(new Set(rawIds));
    if (uniqueIds.length > 5) {
      throw createHttpError('You can select up to 5 preferred categories.', 400);
    }

    if (uniqueIds.length > 0) {
      const existingCount = await Category.countDocuments({ _id: { $in: uniqueIds } });
      if (existingCount !== uniqueIds.length) {
        throw createHttpError('One or more selected categories do not exist.', 400);
      }
    }

    userDoc.preferredCategories = uniqueIds.map((id) => new mongoose.Types.ObjectId(id));
    await userDoc.save();
    return sanitizeUser(userDoc);
  },

  async getAddresses(userDoc: any) {
    return (userDoc.savedAddresses || []).map((addr: any) =>
      typeof addr.toObject === 'function' ? addr.toObject() : addr
    );
  },

  async addAddress(userDoc: any, data: any) {
    const validated = validateAddressPayload(data, false);
    userDoc.savedAddresses = userDoc.savedAddresses || [];

    if (userDoc.savedAddresses.length >= 10) {
      throw createHttpError('You can save up to 10 shipping addresses.', 400);
    }

    const shouldBeDefault = userDoc.savedAddresses.length === 0 || Boolean(data?.isDefault);
    if (shouldBeDefault) {
      userDoc.savedAddresses.forEach((addr: any) => {
        addr.isDefault = false;
      });
    }

    userDoc.savedAddresses.push({
      label: validated.label || 'Home',
      fullName: validated.fullName!,
      phone: validated.phone!,
      address: validated.address!,
      isDefault: shouldBeDefault
    });

    await userDoc.save();
    return sanitizeUser(userDoc);
  },

  async updateAddress(userDoc: any, addressId: string, data: any) {
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      throw createHttpError('Invalid address ID.', 400);
    }

    userDoc.savedAddresses = userDoc.savedAddresses || [];
    const target = userDoc.savedAddresses.find((addr: any) => String(addr._id) === addressId);
    if (!target) {
      throw createHttpError('Saved address not found.', 404);
    }

    const validated = validateAddressPayload(data, true);
    if (validated.label !== undefined) target.label = validated.label;
    if (validated.fullName !== undefined) target.fullName = validated.fullName;
    if (validated.phone !== undefined) target.phone = validated.phone;
    if (validated.address !== undefined) target.address = validated.address;

    if (data?.isDefault === true) {
      userDoc.savedAddresses.forEach((addr: any) => {
        addr.isDefault = String(addr._id) === addressId;
      });
    } else if (data?.isDefault === false && target.isDefault) {
      const fallback = userDoc.savedAddresses.find((addr: any) => String(addr._id) !== addressId);
      if (fallback) {
        target.isDefault = false;
        fallback.isDefault = true;
      } else {
        target.isDefault = true;
      }
    }

    await userDoc.save();
    return sanitizeUser(userDoc);
  },

  async deleteAddress(userDoc: any, addressId: string) {
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      throw createHttpError('Invalid address ID.', 400);
    }

    userDoc.savedAddresses = userDoc.savedAddresses || [];
    const idx = userDoc.savedAddresses.findIndex((addr: any) => String(addr._id) === addressId);
    if (idx === -1) {
      throw createHttpError('Saved address not found.', 404);
    }

    const wasDefault = Boolean(userDoc.savedAddresses[idx].isDefault);
    userDoc.savedAddresses.splice(idx, 1);

    if (wasDefault && userDoc.savedAddresses.length > 0) {
      userDoc.savedAddresses[0].isDefault = true;
    }

    await userDoc.save();
    return sanitizeUser(userDoc);
  },

  async getRecentlyViewed(userId: string) {
    const user = await User.findById(userId).populate({
      path: 'recentlyViewed.productId',
      match: { isDeleted: { $ne: true } },
      populate: { path: 'categoryId', select: 'name slug' }
    });

    if (!user) {
      throw createHttpError('User not found.', 404);
    }

    const validEntries = (user.recentlyViewed || [])
      .filter((entry: any) => entry && entry.productId)
      .sort((a: any, b: any) => new Date(b.viewedAt || 0).getTime() - new Date(a.viewedAt || 0).getTime());

    return validEntries.map((entry: any) => {
      const prodDoc = entry.productId;
      const prodObj = typeof prodDoc.toObject === 'function' ? prodDoc.toObject() : { ...prodDoc };
      return {
        ...prodObj,
        id: prodObj._id,
        category: prodObj.categoryId,
        viewedAt: entry.viewedAt
      };
    });
  },

  async recordRecentlyViewed(userId: string, productId: string) {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw createHttpError('Invalid product ID.', 400);
    }

    const product = await Product.findOne({ _id: productId, isDeleted: { $ne: true } }).select('_id');
    if (!product) {
      throw createHttpError('Product not found.', 404);
    }

    const objectId = new mongoose.Types.ObjectId(productId);
    await User.findByIdAndUpdate(userId, {
      $pull: { recentlyViewed: { productId: objectId } }
    });
    await User.findByIdAndUpdate(userId, {
      $push: {
        recentlyViewed: {
          $each: [{ productId: objectId, viewedAt: new Date() }],
          $position: 0,
          $slice: 16
        }
      }
    });

    return this.getRecentlyViewed(userId);
  },

  async clearRecentlyViewed(userId: string) {
    await User.findByIdAndUpdate(userId, { $set: { recentlyViewed: [] } });
    return [];
  }
};
