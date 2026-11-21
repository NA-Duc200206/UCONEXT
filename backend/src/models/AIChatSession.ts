import { Schema, model, Document } from 'mongoose';

export interface IAIChatProductRef {
  id: string;
  name: string;
  price: number;
  image?: string;
  category?: string;
  stock?: number;
  rating?: number;
  reviewCount?: number;
  options?: {
    colors?: string[];
    sizes?: string[];
  };
}

export interface IAIChatCouponRef {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number;
  estimatedSavings?: number;
}

export interface IAIChatOrderRef {
  id: string;
  shortId: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  totalAmount: number;
  itemCount: number;
  createdAt: Date;
}

export interface IAIChatComparisonItem {
  id: string;
  name: string;
  price: number;
  image?: string;
  category: string;
  stock: number;
  rating?: number;
  reviewCount: number;
  colors: string[];
  sizes: string[];
  highlight: string;
}

export interface IAIChatComparison {
  products: IAIChatComparisonItem[];
  verdict: string;
}

export interface IAIChatMessage {
  role: 'user' | 'assistant';
  text: string;
  intent?: string;
  personalized?: boolean;
  source?: string;
  provider?: string;
  model?: string;
  toolsUsed?: string[];
  products?: IAIChatProductRef[];
  coupons?: IAIChatCouponRef[];
  orders?: IAIChatOrderRef[];
  comparison?: IAIChatComparison;
  followUps?: string[];
  createdAt: Date;
}

export interface IAIChatSession extends Document {
  userId: Schema.Types.ObjectId;
  messages: IAIChatMessage[];
  lastProductIds: string[];
  lastCategoryIds: string[];
  lastBudget?: {
    minPrice?: number;
    maxPrice?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const AIChatProductRefSchema = new Schema<IAIChatProductRef>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String },
    category: { type: String },
    stock: { type: Number },
    rating: { type: Number },
    reviewCount: { type: Number },
    options: {
      type: {
        colors: { type: [String], default: [] },
        sizes: { type: [String], default: [] }
      },
      _id: false
    }
  },
  { _id: false }
);

const AIChatCouponRefSchema = new Schema<IAIChatCouponRef>(
  {
    code: { type: String, required: true },
    discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
    discountValue: { type: Number, required: true },
    minOrderAmount: { type: Number },
    maxDiscountAmount: { type: Number },
    estimatedSavings: { type: Number }
  },
  { _id: false }
);

const AIChatOrderRefSchema = new Schema<IAIChatOrderRef>(
  {
    id: { type: String, required: true },
    shortId: { type: String, required: true },
    status: { type: String, required: true },
    paymentMethod: { type: String, required: true },
    paymentStatus: { type: String, required: true },
    totalAmount: { type: Number, required: true },
    itemCount: { type: Number, required: true },
    createdAt: { type: Date, required: true }
  },
  { _id: false }
);

const AIChatComparisonItemSchema = new Schema<IAIChatComparisonItem>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String },
    category: { type: String, required: true },
    stock: { type: Number, required: true },
    rating: { type: Number },
    reviewCount: { type: Number, required: true },
    colors: { type: [String], default: [] },
    sizes: { type: [String], default: [] },
    highlight: { type: String, required: true }
  },
  { _id: false }
);

const AIChatComparisonSchema = new Schema<IAIChatComparison>(
  {
    products: { type: [AIChatComparisonItemSchema], default: [] },
    verdict: { type: String, required: true }
  },
  { _id: false }
);

const AIChatMessageSchema = new Schema<IAIChatMessage>(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, required: true },
    intent: { type: String },
    personalized: { type: Boolean, default: false },
    source: { type: String, default: 'llm' },
    provider: { type: String },
    model: { type: String },
    toolsUsed: { type: [String], default: undefined },
    products: { type: [AIChatProductRefSchema], default: undefined },
    coupons: { type: [AIChatCouponRefSchema], default: undefined },
    orders: { type: [AIChatOrderRefSchema], default: undefined },
    comparison: { type: AIChatComparisonSchema, default: undefined },
    followUps: { type: [String], default: undefined },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const LastBudgetSchema = new Schema(
  {
    minPrice: { type: Number },
    maxPrice: { type: Number }
  },
  { _id: false }
);

const AIChatSessionSchema = new Schema<IAIChatSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    messages: { type: [AIChatMessageSchema], default: [] },
    lastProductIds: { type: [String], default: [] },
    lastCategoryIds: { type: [String], default: [] },
    lastBudget: { type: LastBudgetSchema, default: undefined }
  },
  {
    timestamps: true
  }
);

export const AIChatSession = model<IAIChatSession>('AIChatSession', AIChatSessionSchema);

