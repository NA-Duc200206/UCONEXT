import { Product, Coupon, Category, Order } from '../models';
import { productService } from './productService';

export interface BudgetRange {
  minPrice?: number;
  maxPrice?: number;
}

const CATEGORY_ALIASES: Record<string, string[]> = {
  'Audio': ['tai nghe', 'loa', 'headphone', 'headphones', 'earbud', 'earbuds', 'microphone', 'speaker', 'speakers', 'audio', 'am thanh', 'âm thanh', 'anc', 'nhạc'],
  'Laptops, Tablets': ['laptop', 'ultrabook', 'tablet', 'ipad', 'macbook', 'e-reader', 'kindle', 'máy tính', 'may tinh'],
  'Monitors, Desk': ['màn hình', 'man hinh', 'bàn phím', 'ban phim', 'chuột', 'chuot', 'monitor', 'keyboard', 'mouse', 'desk', 'webcam'],
  'Charging, Storage': ['sạc', 'sac', 'pin', 'dự phòng', 'du phong', 'ổ cứng', 'o cung', 'ssd', 'charger', 'gan', 'power bank', 'storage', 'camera', 'cáp'],
  'Watches': ['đồng hồ', 'dong ho', 'watch', 'watches', 'smartwatch', 'timepiece'],
  'Bags, Luggage': ['túi', 'tui', 'balo', 'ba lô', 'vali', 'ví', 'vi', 'bag', 'bags', 'backpack', 'luggage', 'wallet', 'sling'],
  'Eyewear, Jewelry': ['kính', 'kinh', 'trang sức', 'trang suc', 'thắt lưng', 'that lung', 'eyewear', 'sunglasses', 'jewelry', 'belt', 'ring', 'necklace'],
  'Tops, Shirts': ['áo', 'ao', 'thun', 'sơ mi', 'so mi', 'polo', 'len', 'shirt', 'shirts', 'tee', 'tees', 'top', 'tops', 'knitwear', 'sweater', 'fashion', 'thời trang', 'thoi trang', 'quần áo'],
  'Outerwear': ['áo khoác', 'ao khoac', 'khoác', 'jacket', 'blazer', 'coat', 'trench', 'vest', 'outerwear', 'hoodie'],
  'Bottoms, Dresses': ['quần', 'quan', 'váy', 'vay', 'đầm', 'dam', 'jeans', 'denim', 'trousers', 'joggers', 'dress', 'dresses', 'skirt', 'bottoms'],
  'Skincare': ['skincare', 'chăm sóc da', 'cham soc da', 'dưỡng da', 'duong da', 'serum', 'kem dưỡng', 'sữa rửa mặt', 'chống nắng', 'moisturizer', 'cleanser', 'sunscreen', 'mỹ phẩm', 'my pham', 'da mặt', 'cosmetic', 'cosmetics'],
  'Fragrance': ['nước hoa', 'nuoc hoa', 'perfume', 'cologne', 'fragrance', 'eau de parfum', 'edp'],
  'Makeup, Hair': ['son', 'trang điểm', 'trang diem', 'tóc', 'toc', 'makeup', 'lipstick', 'lip', 'hair', 'foundation', 'mascara', 'beauty'],
  'Kitchen, Coffee': ['bếp', 'bep', 'cà phê', 'ca phe', 'pha cà phê', 'nồi', 'chảo', 'kitchen', 'coffee', 'espresso', 'grinder', 'kettle', 'cookware', 'appliance'],
  'Home Living': ['nhà', 'nha', 'nội thất', 'noi that', 'đèn', 'den', 'lọc không khí', 'loc khong khi', 'hút bụi', 'hut bui', 'home', 'living', 'vacuum', 'purifier', 'lamp', 'lighting', 'bedding']
};

const STOP_WORDS = new Set([
  'tìm', 'tim', 'sản', 'san', 'phẩm', 'pham', 'dưới', 'duoi', 'trên', 'tren', 'triệu', 'trieu',
  'nghìn', 'nghin', 'ngàn', 'ngan', 'cho', 'tôi', 'toi', 'của', 'cua', 'theo', 'với', 'voi',
  'gợi', 'goi', 'ý', 'y', 'giá', 'gia', 'tầm', 'tam', 'khoảng', 'khoang', 'mua', 'cần', 'can',
  'một', 'mot', 'các', 'cac', 'những', 'nhung', 'nào', 'nao', 'tốt', 'tot', 'nhất', 'nhat',
  'sở', 'so', 'thích', 'thich', 'yêu', 'yeu', 'danh', 'sách', 'sach', 'mã', 'ma', 'giảm', 'giam',
  'find', 'search', 'show', 'product', 'products', 'item', 'items', 'under', 'below', 'over',
  'above', 'between', 'from', 'with', 'for', 'the', 'and', 'best', 'good', 'recommend',
  'recommended', 'recommendations', 'suggest', 'suggestions', 'preferences', 'wishlist', 'please',
  'million', 'thousand', 'vnd', 'price', 'cheap', 'budget', 'my', 'me', 'you'
]);

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseAmountToken(numStr: string, unitStr?: string): number | null {
  const unit = unitStr ? unitStr.toLowerCase() : '';
  if (unit) {
    const cleaned = numStr.replace(/,/g, '.');
    const value = parseFloat(cleaned);
    if (!Number.isFinite(value) || value <= 0) return null;
    if (['triệu', 'trieu', 'tr', 'million', 'm'].includes(unit)) {
      return Math.round(value * 1_000_000);
    }
    if (['nghìn', 'nghin', 'ngàn', 'ngan', 'thousand', 'k'].includes(unit)) {
      return Math.round(value * 1_000);
    }
  }

  const digitsOnly = numStr.replace(/[.,]/g, '');
  const intVal = parseInt(digitsOnly, 10);
  if (!Number.isFinite(intVal) || intVal < 10_000) return null;
  return intVal;
}

export function extractBudget(text: string): BudgetRange {
  const normalized = text.toLowerCase();
  const amountPattern = '(\\d+(?:[.,]\\d{3})*(?:[.,]\\d{1,2})?)\\s*(triệu|trieu|tr|million|m|nghìn|nghin|ngàn|ngan|thousand|k)?(?:\\s*(?:vnd|vnđ|đ|d))?(?![a-z0-9])';

  const rangeRegex = new RegExp(
    `(?:từ|tu|from|between|khoảng|khoang)?\\s*${amountPattern}\\s*(?:đến|den|tới|toi|to|and|và|-|–)\\s*${amountPattern}`,
    'i'
  );
  const rangeMatch = normalized.match(rangeRegex);
  if (rangeMatch) {
    const first = parseAmountToken(rangeMatch[1], rangeMatch[2]);
    const second = parseAmountToken(rangeMatch[3], rangeMatch[4]);
    if (first !== null && second !== null) {
      return {
        minPrice: Math.min(first, second),
        maxPrice: Math.max(first, second)
      };
    }
  }

  const result: BudgetRange = {};

  const upperRegex = new RegExp(
    `(?:dưới|duoi|under|below|tối đa|toi da|max|<=|<|nhỏ hơn|nho hon|ít hơn|it hon|không quá|khong qua)\\s*${amountPattern}`,
    'i'
  );
  const upperMatch = normalized.match(upperRegex);
  if (upperMatch) {
    const val = parseAmountToken(upperMatch[1], upperMatch[2]);
    if (val !== null) result.maxPrice = val;
  }

  const lowerRegex = new RegExp(
    `(?:trên|tren|over|above|tối thiểu|toi thieu|min|>=|>|từ|tu|lớn hơn|lon hon)\\s*${amountPattern}`,
    'i'
  );
  const lowerMatch = normalized.match(lowerRegex);
  if (lowerMatch) {
    const val = parseAmountToken(lowerMatch[1], lowerMatch[2]);
    if (val !== null) result.minPrice = val;
  }

  if (result.minPrice === undefined && result.maxPrice === undefined) {
    const approxRegex = new RegExp(`(?:tầm|tam|khoảng|khoang|around|about)\\s*${amountPattern}`, 'i');
    const approxMatch = normalized.match(approxRegex);
    if (approxMatch) {
      const val = parseAmountToken(approxMatch[1], approxMatch[2]);
      if (val !== null) {
        result.minPrice = Math.round(val * 0.6);
        result.maxPrice = Math.round(val * 1.3);
      }
    }
  }

  return result;
}

export function isVietnameseText(text: string): boolean {
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text)) {
    return true;
  }
  return /\b(tim|san pham|duoi|tren|trieu|nghin|ngan|so thich|goi y|yeu thich|giao hang|thanh toan|bao hanh|doi tra|ma giam gia|cho toi|cua toi)\b/i.test(text);
}

function formatPriceVND(amount: number): string {
  return `${new Intl.NumberFormat('en-US').format(Math.round(amount))} VND`;
}

interface UserAIContext {
  userName: string;
  preferredCategoryIds: string[];
  preferredCategoryNames: string[];
  wishlistProducts: any[];
  wishlistCategoryIds: string[];
  avgOrderItemPrice?: number;
  hasHistory: boolean;
}

async function buildUserAIContext(userDoc: any): Promise<UserAIContext> {
  const preferredCategoryIds = (userDoc.preferredCategories || []).map((id: any) => String(id));
  const wishlistIds = (userDoc.wishlist || []).slice(0, 10);

  const [preferredCats, wishlistProducts, recentOrders] = await Promise.all([
    preferredCategoryIds.length > 0
      ? Category.find({ _id: { $in: preferredCategoryIds } }).select('name').lean()
      : Promise.resolve([]),
    wishlistIds.length > 0
      ? Product.find({ _id: { $in: wishlistIds }, isDeleted: { $ne: true } })
          .populate('categoryId', 'name slug')
          .select('name price image stock categoryId')
          .lean()
      : Promise.resolve([]),
    Order.find({ userId: userDoc._id, status: { $ne: 'cancelled' } })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('totalAmount items')
      .lean()
  ]);

  const preferredCategoryNames = preferredCats.map((c: any) => c.name);
  const wishlistCategoryIds = Array.from(
    new Set(
      wishlistProducts
        .map((p: any) => String((p.categoryId as any)?._id || p.categoryId || ''))
        .filter(Boolean)
    )
  );

  const itemPrices: number[] = [];
  for (const order of recentOrders) {
    for (const item of order.items || []) {
      if (typeof item.price === 'number' && item.price > 0) {
        itemPrices.push(item.price);
      }
    }
  }
  const avgOrderItemPrice =
    itemPrices.length > 0
      ? Math.round(itemPrices.reduce((sum, v) => sum + v, 0) / itemPrices.length)
      : undefined;

  const hasHistory =
    preferredCategoryNames.length > 0 ||
    wishlistProducts.length > 0 ||
    (userDoc.recentlyViewed || []).length > 0 ||
    recentOrders.length > 0;

  return {
    userName: userDoc.name || 'Customer',
    preferredCategoryIds,
    preferredCategoryNames,
    wishlistProducts,
    wishlistCategoryIds,
    avgOrderItemPrice,
    hasHistory
  };
}

async function callGeminiIfConfigured(params: {
  userMessage: string;
  isVi: boolean;
  userContext: UserAIContext | null;
  products: any[];
  coupons: any[];
  budget: BudgetRange;
}): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const productSummary = params.products
    .map((p) => `- ${p.name} (${(p.categoryId as any)?.name || p.category || 'Product'}) - ${formatPriceVND(p.price)}, stock: ${p.stock}`)
    .join('\n');

  const couponSummary = params.coupons
    .map((c) => `- ${c.code}: ${c.discountType === 'percentage' ? `${c.discountValue}% off` : `${formatPriceVND(c.discountValue)} off`}`)
    .join('\n');

  const personalizationSummary = params.userContext
    ? [
        `Customer name: ${params.userContext.userName}`,
        params.userContext.preferredCategoryNames.length > 0
          ? `Preferred categories: ${params.userContext.preferredCategoryNames.join(', ')}`
          : null,
        params.userContext.wishlistProducts.length > 0
          ? `Wishlist items: ${params.userContext.wishlistProducts.slice(0, 5).map((w) => w.name).join(', ')}`
          : null,
        params.userContext.avgOrderItemPrice
          ? `Typical past item spend: ~${formatPriceVND(params.userContext.avgOrderItemPrice)}`
          : null
      ]
        .filter(Boolean)
        .join('\n')
    : 'Guest customer (not signed in).';

  const prompt = [
    `You are UCONEXT AI Shopping Assistant. Reply concisely (2-4 sentences) in ${params.isVi ? 'Vietnamese' : 'English'}.`,
    'Only recommend products and coupons from the provided database context below; format prices as VND (e.g., 1,000,000 VND).',
    `User personalization context:\n${personalizationSummary}`,
    params.budget.minPrice !== undefined || params.budget.maxPrice !== undefined
      ? `Detected budget filter: min=${params.budget.minPrice ?? 'none'}, max=${params.budget.maxPrice ?? 'none'}`
      : '',
    `Matched products:\n${productSummary || 'None'}`,
    `Active coupons:\n${couponSummary || 'None'}`,
    `Customer question: "${params.userMessage}"`
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 260
        }
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) return null;
    const data: any = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof text === 'string' && text.trim().length > 0 ? text.trim() : null;
  } catch {
    return null;
  }
}

export const aiService = {
  async chat(userMessage: string, userDoc?: any) {
    const rawMessage = userMessage.trim();
    const text = rawMessage.toLowerCase();
    const isVi = isVietnameseText(rawMessage);
    const budget = extractBudget(rawMessage);

    // 1. Fetch active coupons & categories in parallel
    const now = new Date();
    const [activeCoupons, allCategories, userContext] = await Promise.all([
      Coupon.find({
        isDeleted: false,
        startDate: { $lte: now },
        endDate: { $gte: now }
      })
        .limit(2)
        .lean(),
      Category.find().select('name slug').lean(),
      userDoc ? buildUserAIContext(userDoc) : Promise.resolve(null)
    ]);

    // 2. Match categories from user message
    const matchedCategoryIds: string[] = [];
    for (const cat of allCategories) {
      const aliases = CATEGORY_ALIASES[cat.name] || [];
      const catNameLower = cat.name.toLowerCase();
      if (
        text.includes(catNameLower) ||
        aliases.some((alias) => text.includes(alias))
      ) {
        matchedCategoryIds.push(String(cat._id));
      }
    }

    // 3. Detect intent
    const isPersonalizationQuery =
      /(sở thích|so thich|gợi ý cho tôi|goi y cho toi|theo sở thích|theo so thich|danh sách yêu thích|danh sach yeu thich|wishlist|recommended|for me|my preferences|preferences|dành cho tôi|danh cho toi)/i.test(text);
    const isWishlistQuery = /(wishlist|danh sách yêu thích|danh sach yeu thich|sản phẩm yêu thích)/i.test(text);
    const isShippingQuery = /(ship|giao hàng|giao hang|delivery|vận chuyển|van chuyen)/i.test(text);
    const isPaymentQuery = /(payment|thanh toán|thanh toan|vnpay|cod)/i.test(text);
    const isReturnQuery = /(return|đổi trả|doi tra|warranty|bảo hành|bao hanh)/i.test(text);

    // 4. Meaningful keywords (escaped for regex)
    const rawTokens = text
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

    const meaningfulKeywords = rawTokens.filter((w) => !['triệu', 'trieu', 'nghin', 'nghìn', 'ngàn'].includes(w));

    const priceQuery: any = {};
    if (budget.minPrice !== undefined) priceQuery.$gte = budget.minPrice;
    if (budget.maxPrice !== undefined) priceQuery.$lte = budget.maxPrice;
    const hasPriceFilter = Object.keys(priceQuery).length > 0;

    let matchedProducts: any[] = [];
    let personalizedUsed = false;

    const preferredCatSet = new Set<string>([
      ...(userContext?.preferredCategoryIds || []),
      ...(userContext?.wishlistCategoryIds || [])
    ]);

    const sortByPersonalization = (items: any[]) => {
      return [...items].sort((a, b) => {
        const aCat = String((a.categoryId as any)?._id || a.categoryId || '');
        const bCat = String((b.categoryId as any)?._id || b.categoryId || '');
        const aPref = preferredCatSet.has(aCat) ? 1 : 0;
        const bPref = preferredCatSet.has(bCat) ? 1 : 0;
        if (bPref !== aPref) return bPref - aPref;

        if (userContext?.avgOrderItemPrice && !hasPriceFilter) {
          const diffA = Math.abs((a.price || 0) - userContext.avgOrderItemPrice);
          const diffB = Math.abs((b.price || 0) - userContext.avgOrderItemPrice);
          if (diffA !== diffB) return diffA - diffB;
        }
        return (b.stock || 0) - (a.stock || 0);
      });
    };

    if (isWishlistQuery && userContext && userContext.wishlistProducts.length > 0) {
      let pool = userContext.wishlistProducts.filter((p) => (p.stock ?? 0) > 0);
      if (hasPriceFilter) {
        pool = pool.filter(
          (p) =>
            (budget.minPrice === undefined || p.price >= budget.minPrice) &&
            (budget.maxPrice === undefined || p.price <= budget.maxPrice)
        );
      }
      if (pool.length > 0) {
        matchedProducts = pool.slice(0, 4);
        personalizedUsed = true;
      }
    }

    if (matchedProducts.length === 0 && (isPersonalizationQuery || (userContext?.hasHistory && matchedCategoryIds.length === 0 && meaningfulKeywords.length === 0))) {
      const recResult = await productService.getRecommended(userDoc, 24);
      let recPool = recResult.products || [];
      if (hasPriceFilter) {
        recPool = recPool.filter(
          (p: any) =>
            (budget.minPrice === undefined || p.price >= budget.minPrice) &&
            (budget.maxPrice === undefined || p.price <= budget.maxPrice)
        );
      }
      if (recPool.length > 0) {
        matchedProducts = recPool.slice(0, 4);
        personalizedUsed = Boolean(recResult.personalized);
      }
    }

    if (matchedProducts.length === 0 && (matchedCategoryIds.length > 0 || meaningfulKeywords.length > 0 || hasPriceFilter)) {
      const query: any = { isDeleted: { $ne: true }, stock: { $gt: 0 } };
      if (hasPriceFilter) {
        query.price = priceQuery;
      }

      if (matchedCategoryIds.length > 0 && meaningfulKeywords.length > 0) {
        const escapedRegex = meaningfulKeywords.map(escapeRegex).join('|');
        const combinedCandidates = await Product.find({
          ...query,
          categoryId: { $in: matchedCategoryIds },
          $or: [
            { name: { $regex: escapedRegex, $options: 'i' } },
            { description: { $regex: escapedRegex, $options: 'i' } }
          ]
        })
          .populate('categoryId', 'name slug')
          .sort({ stock: -1, createdAt: -1 })
          .limit(20)
          .lean();

        if (combinedCandidates.length > 0) {
          matchedProducts = sortByPersonalization(combinedCandidates).slice(0, 4);
        } else {
          const catCandidates = await Product.find({
            ...query,
            categoryId: { $in: matchedCategoryIds }
          })
            .populate('categoryId', 'name slug')
            .sort({ stock: -1, createdAt: -1 })
            .limit(20)
            .lean();
          matchedProducts = sortByPersonalization(catCandidates).slice(0, 4);
        }
      } else if (matchedCategoryIds.length > 0) {
        const catCandidates = await Product.find({
          ...query,
          categoryId: { $in: matchedCategoryIds }
        })
          .populate('categoryId', 'name slug')
          .sort({ stock: -1, createdAt: -1 })
          .limit(20)
          .lean();
        matchedProducts = sortByPersonalization(catCandidates).slice(0, 4);
      } else if (meaningfulKeywords.length > 0) {
        const escapedRegex = meaningfulKeywords.map(escapeRegex).join('|');
        const kwCandidates = await Product.find({
          ...query,
          $or: [
            { name: { $regex: escapedRegex, $options: 'i' } },
            { description: { $regex: escapedRegex, $options: 'i' } }
          ]
        })
          .populate('categoryId', 'name slug')
          .sort({ stock: -1, createdAt: -1 })
          .limit(20)
          .lean();
        matchedProducts = sortByPersonalization(kwCandidates).slice(0, 4);
      } else if (hasPriceFilter) {
        const budgetCandidates = await Product.find(query)
          .populate('categoryId', 'name slug')
          .sort({ stock: -1, createdAt: -1 })
          .limit(24)
          .lean();
        matchedProducts = sortByPersonalization(budgetCandidates).slice(0, 4);
      }

      if (matchedProducts.length > 0 && userContext?.hasHistory) {
        personalizedUsed = matchedProducts.some((p) =>
          preferredCatSet.has(String((p.categoryId as any)?._id || p.categoryId || ''))
        );
      }
    }

    if (matchedProducts.length === 0) {
      const recResult = await productService.getRecommended(userDoc, 4);
      matchedProducts = recResult.products || [];
      personalizedUsed = Boolean(recResult.personalized);
    }

    // 5. Build response message (Gemini when configured, otherwise bilingual rules)
    let responseText = '';
    const geminiReply = !isShippingQuery && !isPaymentQuery && !isReturnQuery
      ? await callGeminiIfConfigured({
          userMessage: rawMessage,
          isVi,
          userContext,
          products: matchedProducts,
          coupons: activeCoupons,
          budget
        })
      : null;

    const couponNotice = activeCoupons.length > 0
      ? isVi
        ? `\n\n💡 Mẹo nhỏ: Dùng mã "${activeCoupons[0].code}" khi thanh toán để được giảm ${activeCoupons[0].discountType === 'percentage' ? `${activeCoupons[0].discountValue}%` : formatPriceVND(activeCoupons[0].discountValue)}!`
        : `\n\n💡 Pro tip: You can use code "${activeCoupons[0].code}" for ${activeCoupons[0].discountType === 'percentage' ? `${activeCoupons[0].discountValue}% off` : `${formatPriceVND(activeCoupons[0].discountValue)} off`} at checkout!`
      : '';

    if (geminiReply) {
      responseText = geminiReply;
    } else if (isShippingQuery) {
      responseText = isVi
        ? `UCONEXT giao hàng toàn quốc từ 1–3 ngày làm việc và miễn phí vận chuyển cho đơn từ 1,000,000 VND.${couponNotice}`
        : `We provide nationwide expedited delivery across Vietnam. Orders above 1,000,000 VND enjoy 100% free shipping, arriving within 1–3 business days.${couponNotice}`;
    } else if (isPaymentQuery) {
      responseText = isVi
        ? `UCONEXT hỗ trợ thanh toán khi nhận hàng (COD) và thanh toán trực tuyến an toàn qua VNPAY QR, thẻ ATM nội địa, Visa, Mastercard.${couponNotice}`
        : `UCONEXT supports Cash On Delivery (COD) as well as secure instant payments via VNPAY QR, domestic ATM cards, Visa, and Mastercard.${couponNotice}`;
    } else if (isReturnQuery) {
      responseText = isVi
        ? `Tất cả sản phẩm tại UCONEXT đều chính hãng 100% và được bảo hành/đổi trả minh bạch trong vòng 30 ngày.${couponNotice}`
        : `All products at UCONEXT are 100% certified authentic and backed by a 30-day transparent exchange and warranty policy.${couponNotice}`;
    } else if (matchedProducts.length > 0) {
      const names = matchedProducts.slice(0, 3).map((p) => `"${p.name}"`).join(', ');
      if (personalizedUsed && userContext) {
        const prefNote = userContext.preferredCategoryNames.length > 0
          ? userContext.preferredCategoryNames.slice(0, 3).join(', ')
          : isVi ? 'lịch sử mua sắm & yêu thích của bạn' : 'your saved preferences and browsing activity';
        responseText = isVi
          ? `Dựa trên ${prefNote}, mình gợi ý cho ${userContext.userName} các sản phẩm phù hợp nhất: ${names}.${couponNotice}`
          : `Based on ${prefNote}, here are our tailored recommendations for you: ${names}.${couponNotice}`;
      } else if (hasPriceFilter) {
        const budgetDesc = budget.minPrice !== undefined && budget.maxPrice !== undefined
          ? `${formatPriceVND(budget.minPrice)} – ${formatPriceVND(budget.maxPrice)}`
          : budget.maxPrice !== undefined
            ? (isVi ? `dưới ${formatPriceVND(budget.maxPrice)}` : `under ${formatPriceVND(budget.maxPrice)}`)
            : (isVi ? `trên ${formatPriceVND(budget.minPrice!)}` : `above ${formatPriceVND(budget.minPrice!)}`);
        responseText = isVi
          ? `Đây là các sản phẩm nổi bật trong tầm giá ${budgetDesc}: ${names}.${couponNotice}`
          : `Here are top picks matching your budget (${budgetDesc}): ${names}.${couponNotice}`;
      } else {
        responseText = isVi
          ? `Dưới đây là các sản phẩm nổi bật phù hợp với nhu cầu của bạn: ${names}.${couponNotice}`
          : `Based on your interest, here are our recommended top-rated picks: ${names}.${couponNotice}`;
      }
    } else {
      responseText = isVi
        ? `Chào mừng bạn đến với UCONEXT! Bạn có thể hỏi về công nghệ, thời trang, mỹ phẩm hoặc tìm sản phẩm theo ngân sách.${couponNotice}`
        : `Welcome to UCONEXT! Feel free to ask about tech gadgets, apparel, skincare collections, or budget-based recommendations.${couponNotice}`;
    }

    return {
      message: responseText,
      personalized: personalizedUsed,
      products: matchedProducts.map((p) => ({
        id: p._id || p.id,
        name: p.name,
        price: p.price,
        image: p.image,
        category: (p.categoryId as any)?.name || (p.category as any)?.name || 'Product',
        stock: p.stock
      })),
      coupons: activeCoupons.map((c) => ({
        code: c.code,
        discountType: c.discountType,
        discountValue: c.discountValue
      }))
    };
  }
};
