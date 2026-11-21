import { Schema, model, Document } from 'mongoose';

export interface ICartItem {
  productId: Schema.Types.ObjectId;
  name: string;
  price: number;
  image?: string;
  quantity: number;
  color?: string;
  size?: string;
}

export interface IRecentlyViewedItem {
  productId: Schema.Types.ObjectId;
  viewedAt: Date;
}

export interface ISavedAddress {
  _id?: Schema.Types.ObjectId;
  label: string;
  fullName: string;
  phone: string;
  address: string;
  isDefault: boolean;
}

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  role: 'guest' | 'customer' | 'warehouse' | 'support' | 'sales' | 'admin' | 'super_admin';
  avatar?: string;
  googleId?: string;
  firebaseUid?: string;
  phone?: string;
  authProvider: 'local' | 'google' | 'facebook' | 'github' | 'apple' | 'phone' | 'firebase';
  cart: ICartItem[];
  wishlist: Schema.Types.ObjectId[];
  preferredCategories: Schema.Types.ObjectId[];
  recentlyViewed: IRecentlyViewedItem[];
  savedAddresses: ISavedAddress[];
  refreshTokens: string[];
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CartItemSchema = new Schema<ICartItem>({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  image: { type: String },
  quantity: { type: Number, required: true, default: 1 },
  color: { type: String },
  size: { type: String }
}, { _id: false });

const RecentlyViewedSchema = new Schema<IRecentlyViewedItem>({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  viewedAt: { type: Date, default: Date.now }
}, { _id: false });

const SavedAddressSchema = new Schema<ISavedAddress>({
  label: { type: String, required: true, trim: true, default: 'Home' },
  fullName: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  isDefault: { type: Boolean, default: false }
});

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, select: false },
  role: {
    type: String,
    enum: ['guest', 'customer', 'warehouse', 'support', 'sales', 'admin', 'super_admin'],
    default: 'customer'
  },
  avatar: { type: String },
  googleId: { type: String, sparse: true, index: true },
  firebaseUid: { type: String, sparse: true, index: true },
  phone: { type: String, sparse: true, index: true },
  authProvider: {
    type: String,
    enum: ['local', 'google', 'facebook', 'github', 'apple', 'phone', 'firebase'],
    default: 'local'
  },
  cart: { type: [CartItemSchema], default: [] },
  wishlist: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  preferredCategories: { type: [{ type: Schema.Types.ObjectId, ref: 'Category' }], default: [] },
  recentlyViewed: { type: [RecentlyViewedSchema], default: [] },
  savedAddresses: { type: [SavedAddressSchema], default: [] },
  refreshTokens: { type: [String], default: [], select: false },
  resetPasswordToken: { type: String, select: false },
  resetPasswordExpires: { type: Date, select: false }
}, {
  timestamps: true
});

export const User = model<IUser>('User', UserSchema);
