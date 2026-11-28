export interface OpenApiDocument {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string; description: string }>;
  tags: Array<{ name: string; description: string }>;
  components: {
    securitySchemes: Record<string, unknown>;
    schemas: Record<string, unknown>;
  };
  paths: Record<string, Record<string, unknown>>;
}

const bearerSecurity = [{ BearerAuth: [] }];

const errorResponse = {
  description: 'Error response',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
    },
  },
};

const idPathParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
  description: 'MongoDB ObjectId',
};

const productIdPathParam = {
  name: 'productId',
  in: 'path',
  required: true,
  schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
  description: 'Product MongoDB ObjectId',
};

export function createOpenApiSpec(serverUrl = ''): OpenApiDocument {
  const servers = serverUrl
    ? [{ url: serverUrl, description: 'Current server' }]
    : [{ url: '/', description: 'Current origin' }];

  return {
    openapi: '3.0.3',
    info: {
      title: 'UCONEXT E-Commerce API',
      version: '1.0.0',
      description:
        'REST API for the UCONEXT multi-product storefront, admin portal, JWT + Firebase authentication, atomic inventory checkout, VNPAY/COD payments, and AI Shopping Concierge.',
    },
    servers,
    tags: [
      { name: 'Health', description: 'Liveness and internal readiness probes' },
      { name: 'Auth', description: 'JWT + refresh cookie sessions, Firebase Google login, profile, cart & addresses' },
      { name: 'Products', description: 'Catalog search, filtering, recommendations, and admin product CRUD' },
      { name: 'Categories', description: 'Store categories and admin management' },
      { name: 'Orders', description: 'Checkout, customer order history, cancellation, refund & admin fulfillment' },
      { name: 'Payments', description: 'Payment methods, VNPAY checkout URL generation, verification & IPN' },
      { name: 'Coupons', description: 'Voucher discovery, validation, and admin CRUD' },
      { name: 'Reviews', description: 'Verified product ratings and reviews' },
      { name: 'Wishlist', description: 'Authenticated user saved products' },
      { name: 'Media', description: 'Secure raster image upload (WebP conversion via Sharp, local or S3/R2)' },
      { name: 'Analytics', description: 'Admin dashboard metrics and audit logs' },
      { name: 'AI', description: 'Multi-provider AI Shopping Concierge and product review summaries' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Paste the JWT access token returned by POST /api/auth/login or /api/auth/register.',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            code: { type: 'string', example: 'VALIDATION_ERROR' },
            message: { type: 'string', example: 'Invalid request payload.' },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'customer@example.com' },
            password: { type: 'string', minLength: 1, example: 'StrongPassword1' },
          },
        },
        RegisterRequest: {
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 80, example: 'Nguyen Van A' },
            email: { type: 'string', format: 'email', example: 'customer@example.com' },
            password: { type: 'string', minLength: 8, maxLength: 128, example: 'StrongPassword1' },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            token: { type: 'string', description: 'Short-lived JWT access token' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                email: { type: 'string', format: 'email' },
                role: { type: 'string', enum: ['customer', 'admin', 'warehouse', 'support', 'sales'] },
              },
            },
          },
        },
        ProductInput: {
          type: 'object',
          required: ['name', 'price', 'stock', 'categoryId'],
          properties: {
            name: { type: 'string', example: 'Studio Monitor Headphones' },
            price: { type: 'number', minimum: 0, example: 2490000 },
            stock: { type: 'integer', minimum: 0, example: 25 },
            categoryId: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
            description: { type: 'string' },
            image: { type: 'string', example: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e' },
            options: {
              type: 'object',
              properties: {
                colors: { type: 'array', items: { type: 'string' } },
                sizes: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
        CreateOrderRequest: {
          type: 'object',
          required: ['items', 'shippingAddress'],
          properties: {
            items: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['productId', 'quantity'],
                properties: {
                  productId: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
                  quantity: { type: 'integer', minimum: 1, maximum: 99 },
                  color: { type: 'string', nullable: true },
                  size: { type: 'string', nullable: true },
                },
              },
            },
            shippingAddress: { type: 'string', example: '123 Nguyen Hue, District 1, HCMC' },
            billingAddress: { type: 'string', nullable: true },
            paymentMethod: { type: 'string', enum: ['cod', 'vnpay'], default: 'cod' },
            couponCode: { type: 'string', nullable: true, example: 'WELCOME10' },
          },
        },
        AiChatRequest: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string', maxLength: 1000, example: 'Recommend wireless headphones under 2 million VND' },
            history: {
              type: 'array',
              maxItems: 20,
              items: {
                type: 'object',
                required: ['role', 'text'],
                properties: {
                  role: { type: 'string', enum: ['user', 'assistant'] },
                  text: { type: 'string', maxLength: 2000 },
                },
              },
            },
            context: {
              type: 'object',
              properties: {
                page: { type: 'string', example: '/products' },
                productId: { type: 'string', nullable: true },
                cartTotal: { type: 'number' },
                cartCount: { type: 'integer' },
              },
            },
          },
        },
      },
    },
    paths: {
      '/api/health': {
        get: {
          tags: ['Health'],
          summary: 'Public liveness health check',
          responses: {
            200: {
              description: 'API and MongoDB are healthy',
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' } } },
                },
              },
            },
            503: { description: 'Database disconnected (degraded)' },
          },
        },
      },
      '/api/health/ready': {
        get: {
          tags: ['Health'],
          summary: 'Internal readiness probe (DB & Redis diagnostics)',
          description: 'Accessible from internal networks or via the x-health-token header in production.',
          responses: {
            200: { description: 'Ready with DB and Redis connection metadata' },
            403: errorResponse,
            503: { description: 'Degraded' },
          },
        },
      },

      // ---- Auth ----
      '/api/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Register a new customer account',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } } },
          },
          responses: {
            201: {
              description: 'Account created and HttpOnly refresh cookie issued',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } },
            },
            400: errorResponse,
          },
        },
      },
      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Sign in with email and password',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
          },
          responses: {
            200: {
              description: 'Authenticated',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } },
            },
            401: errorResponse,
          },
        },
      },
      '/api/auth/firebase': {
        post: {
          tags: ['Auth'],
          summary: 'Sign in or sign up with a Firebase ID token (Google OAuth)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['idToken'], properties: { idToken: { type: 'string' } } },
              },
            },
          },
          responses: {
            200: {
              description: 'Authenticated via Firebase',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } },
            },
            401: errorResponse,
          },
        },
      },
      '/api/auth/refresh': {
        post: {
          tags: ['Auth'],
          summary: 'Rotate HttpOnly refresh cookie and issue a fresh JWT access token',
          responses: {
            200: { description: 'Fresh access token issued' },
            401: errorResponse,
          },
        },
      },
      '/api/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Sign out current session and clear refresh cookie',
          responses: { 200: { description: 'Signed out' } },
        },
      },
      '/api/auth/logout-all': {
        post: {
          tags: ['Auth'],
          summary: 'Revoke all active sessions for the current user',
          security: bearerSecurity,
          responses: { 200: { description: 'All sessions revoked' }, 401: errorResponse },
        },
      },
      '/api/auth/forgot-password': {
        post: {
          tags: ['Auth'],
          summary: 'Request a password reset email',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } },
              },
            },
          },
          responses: { 200: { description: 'Reset instructions dispatched if account exists' } },
        },
      },
      '/api/auth/reset-password': {
        post: {
          tags: ['Auth'],
          summary: 'Reset password using emailed reset token',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['token', 'newPassword'],
                  properties: { token: { type: 'string' }, newPassword: { type: 'string', minLength: 8 } },
                },
              },
            },
          },
          responses: { 200: { description: 'Password updated' }, 400: errorResponse },
        },
      },
      '/api/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Get authenticated user profile',
          security: bearerSecurity,
          responses: { 200: { description: 'Current user profile' }, 401: errorResponse },
        },
        put: {
          tags: ['Auth'],
          summary: 'Update authenticated user profile',
          security: bearerSecurity,
          responses: { 200: { description: 'Profile updated' }, 400: errorResponse },
        },
      },
      '/api/auth/password': {
        put: {
          tags: ['Auth'],
          summary: 'Change password and revoke other sessions',
          security: bearerSecurity,
          responses: { 200: { description: 'Password changed' }, 400: errorResponse },
        },
      },
      '/api/auth/cart': {
        put: {
          tags: ['Auth'],
          summary: 'Sync shopping cart items to user profile',
          security: bearerSecurity,
          responses: { 200: { description: 'Cart synced' }, 400: errorResponse },
        },
      },
      '/api/auth/preferences': {
        put: {
          tags: ['Auth'],
          summary: 'Update preferred product categories',
          security: bearerSecurity,
          responses: { 200: { description: 'Preferences updated' } },
        },
      },
      '/api/auth/addresses': {
        get: {
          tags: ['Auth'],
          summary: 'List saved shipping addresses',
          security: bearerSecurity,
          responses: { 200: { description: 'Saved addresses' } },
        },
        post: {
          tags: ['Auth'],
          summary: 'Add a saved shipping address',
          security: bearerSecurity,
          responses: { 201: { description: 'Address created' }, 400: errorResponse },
        },
      },
      '/api/auth/addresses/{addressId}': {
        put: {
          tags: ['Auth'],
          summary: 'Update a saved shipping address',
          security: bearerSecurity,
          parameters: [{ name: 'addressId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Address updated' }, 404: errorResponse },
        },
        delete: {
          tags: ['Auth'],
          summary: 'Delete a saved shipping address',
          security: bearerSecurity,
          parameters: [{ name: 'addressId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Address deleted' }, 404: errorResponse },
        },
      },
      '/api/auth/recently-viewed': {
        get: {
          tags: ['Auth'],
          summary: 'List recently viewed products',
          security: bearerSecurity,
          responses: { 200: { description: 'Recently viewed products' } },
        },
        delete: {
          tags: ['Auth'],
          summary: 'Clear recently viewed history',
          security: bearerSecurity,
          responses: { 200: { description: 'Cleared' } },
        },
      },
      '/api/auth/recently-viewed/{productId}': {
        post: {
          tags: ['Auth'],
          summary: 'Record a product view',
          security: bearerSecurity,
          parameters: [productIdPathParam],
          responses: { 200: { description: 'Recorded' } },
        },
      },
      '/api/auth/users': {
        get: {
          tags: ['Auth'],
          summary: 'List all users (Admin)',
          security: bearerSecurity,
          responses: { 200: { description: 'User list' }, 403: errorResponse },
        },
      },
      '/api/auth/users/{id}/role': {
        put: {
          tags: ['Auth'],
          summary: 'Update user role (Admin)',
          security: bearerSecurity,
          parameters: [idPathParam],
          responses: { 200: { description: 'Role updated' }, 403: errorResponse },
        },
      },

      // ---- Products ----
      '/api/products': {
        get: {
          tags: ['Products'],
          summary: 'List and filter storefront products',
          parameters: [
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'categoryId', in: 'query', schema: { type: 'string' }, description: 'Single or comma-separated ObjectIds' },
            { name: 'minPrice', in: 'query', schema: { type: 'number' } },
            { name: 'maxPrice', in: 'query', schema: { type: 'number' } },
            { name: 'inStock', in: 'query', schema: { type: 'boolean' } },
            { name: 'minRating', in: 'query', schema: { type: 'number', minimum: 0, maximum: 5 } },
            {
              name: 'sort',
              in: 'query',
              schema: { type: 'string', enum: ['newest', 'price_asc', 'price_desc', 'name_asc', 'name_desc', 'rating_desc'] },
            },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 24, maximum: 100 } },
          ],
          responses: { 200: { description: 'Paginated products list with rating aggregates' } },
        },
        post: {
          tags: ['Products'],
          summary: 'Create a product (Admin)',
          security: bearerSecurity,
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProductInput' } } },
          },
          responses: { 201: { description: 'Product created' }, 400: errorResponse, 403: errorResponse },
        },
      },
      '/api/products/recommended': {
        get: {
          tags: ['Products'],
          summary: 'Get personalized or top-rated product recommendations',
          parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 8, maximum: 48 } }],
          responses: { 200: { description: 'Recommended products' } },
        },
      },
      '/api/products/{id}': {
        get: {
          tags: ['Products'],
          summary: 'Get product details by ID',
          parameters: [idPathParam],
          responses: { 200: { description: 'Product detail' }, 404: errorResponse },
        },
        put: {
          tags: ['Products'],
          summary: 'Update product (Admin)',
          security: bearerSecurity,
          parameters: [idPathParam],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProductInput' } } },
          },
          responses: { 200: { description: 'Product updated' }, 403: errorResponse, 404: errorResponse },
        },
        delete: {
          tags: ['Products'],
          summary: 'Soft-delete product (Admin)',
          security: bearerSecurity,
          parameters: [idPathParam],
          responses: { 200: { description: 'Product soft-deleted' }, 403: errorResponse, 404: errorResponse },
        },
      },

      // ---- Categories ----
      '/api/categories': {
        get: {
          tags: ['Categories'],
          summary: 'List all categories with active product counts',
          responses: { 200: { description: 'Category list' } },
        },
        post: {
          tags: ['Categories'],
          summary: 'Create a category (Admin)',
          security: bearerSecurity,
          responses: { 201: { description: 'Category created' }, 403: errorResponse },
        },
      },
      '/api/categories/{id}': {
        put: {
          tags: ['Categories'],
          summary: 'Update a category (Admin)',
          security: bearerSecurity,
          parameters: [idPathParam],
          responses: { 200: { description: 'Category updated' }, 403: errorResponse },
        },
        delete: {
          tags: ['Categories'],
          summary: 'Delete an empty category (Admin)',
          security: bearerSecurity,
          parameters: [idPathParam],
          responses: { 200: { description: 'Category deleted' }, 400: errorResponse, 403: errorResponse },
        },
      },

      // ---- Orders ----
      '/api/orders': {
        post: {
          tags: ['Orders'],
          summary: 'Create a new order with atomic stock deduction and optional coupon',
          security: bearerSecurity,
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateOrderRequest' } } },
          },
          responses: { 201: { description: 'Order created' }, 400: errorResponse, 401: errorResponse },
        },
        get: {
          tags: ['Orders'],
          summary: 'List all orders with filtering and pagination (Admin)',
          security: bearerSecurity,
          responses: { 200: { description: 'All orders' }, 403: errorResponse },
        },
      },
      '/api/orders/my-orders': {
        get: {
          tags: ['Orders'],
          summary: 'List orders for the authenticated customer',
          security: bearerSecurity,
          responses: { 200: { description: 'Customer orders' }, 401: errorResponse },
        },
      },
      '/api/orders/{id}': {
        get: {
          tags: ['Orders'],
          summary: 'Get order details (owner or Admin)',
          security: bearerSecurity,
          parameters: [idPathParam],
          responses: { 200: { description: 'Order detail' }, 403: errorResponse, 404: errorResponse },
        },
      },
      '/api/orders/{id}/cancel': {
        put: {
          tags: ['Orders'],
          summary: 'Cancel an order and restore stock',
          security: bearerSecurity,
          parameters: [idPathParam],
          responses: { 200: { description: 'Order cancelled' }, 400: errorResponse },
        },
      },
      '/api/orders/{id}/refund-request': {
        post: {
          tags: ['Orders'],
          summary: 'Submit a refund request for a delivered order',
          security: bearerSecurity,
          parameters: [idPathParam],
          responses: { 200: { description: 'Refund requested' }, 400: errorResponse },
        },
      },
      '/api/orders/{id}/status': {
        put: {
          tags: ['Orders'],
          summary: 'Advance or update order fulfillment status (Admin)',
          security: bearerSecurity,
          parameters: [idPathParam],
          responses: { 200: { description: 'Order status updated' }, 400: errorResponse, 403: errorResponse },
        },
      },

      // ---- Payments ----
      '/api/payment/methods': {
        get: {
          tags: ['Payments'],
          summary: 'List enabled payment methods (COD, optional VNPAY)',
          responses: { 200: { description: 'Enabled payment methods' } },
        },
      },
      '/api/payment/create-payment-url/{id}': {
        post: {
          tags: ['Payments'],
          summary: 'Generate a signed VNPAY checkout URL for an unpaid order',
          security: bearerSecurity,
          parameters: [idPathParam],
          responses: { 200: { description: 'Signed VNPAY redirect URL' }, 400: errorResponse, 503: errorResponse },
        },
      },
      '/api/payment/verify-payment': {
        get: {
          tags: ['Payments'],
          summary: 'Verify VNPAY return query signature and finalize payment status',
          responses: { 200: { description: 'Verification outcome' }, 400: errorResponse },
        },
      },
      '/api/payment/vnpay_ipn': {
        get: {
          tags: ['Payments'],
          summary: 'VNPAY server-to-server IPN webhook callback',
          responses: { 200: { description: 'VNPAY RspCode acknowledgment' } },
        },
      },

      // ---- Coupons ----
      '/api/coupons/active': {
        get: {
          tags: ['Coupons'],
          summary: 'List currently active storefront coupons',
          responses: { 200: { description: 'Active coupons' } },
        },
      },
      '/api/coupons/validate': {
        post: {
          tags: ['Coupons'],
          summary: 'Validate a coupon code against an order subtotal',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['code', 'orderAmount'],
                  properties: { code: { type: 'string', example: 'WELCOME10' }, orderAmount: { type: 'number', example: 500000 } },
                },
              },
            },
          },
          responses: { 200: { description: 'Coupon discount preview' }, 400: errorResponse },
        },
      },
      '/api/coupons': {
        get: {
          tags: ['Coupons'],
          summary: 'List all coupons (Admin)',
          security: bearerSecurity,
          responses: { 200: { description: 'All coupons' }, 403: errorResponse },
        },
        post: {
          tags: ['Coupons'],
          summary: 'Create a coupon (Admin)',
          security: bearerSecurity,
          responses: { 201: { description: 'Coupon created' }, 403: errorResponse },
        },
      },
      '/api/coupons/{id}': {
        put: {
          tags: ['Coupons'],
          summary: 'Update or pause/resume a coupon (Admin)',
          security: bearerSecurity,
          parameters: [idPathParam],
          responses: { 200: { description: 'Coupon updated' }, 403: errorResponse },
        },
        delete: {
          tags: ['Coupons'],
          summary: 'Delete a coupon (Admin)',
          security: bearerSecurity,
          parameters: [idPathParam],
          responses: { 200: { description: 'Coupon deleted' }, 403: errorResponse },
        },
      },

      // ---- Reviews ----
      '/api/reviews/product/{productId}': {
        get: {
          tags: ['Reviews'],
          summary: 'List reviews and rating breakdown for a product',
          parameters: [productIdPathParam],
          responses: { 200: { description: 'Product reviews' } },
        },
      },
      '/api/reviews': {
        post: {
          tags: ['Reviews'],
          summary: 'Submit or update a product review (verified purchasers)',
          security: bearerSecurity,
          responses: { 201: { description: 'Review saved' }, 400: errorResponse, 401: errorResponse },
        },
      },
      '/api/reviews/{id}': {
        delete: {
          tags: ['Reviews'],
          summary: 'Delete a review (owner or Admin)',
          security: bearerSecurity,
          parameters: [idPathParam],
          responses: { 200: { description: 'Review deleted' }, 403: errorResponse },
        },
      },

      // ---- Wishlist ----
      '/api/wishlist': {
        get: {
          tags: ['Wishlist'],
          summary: 'Get authenticated user wishlist',
          security: bearerSecurity,
          responses: { 200: { description: 'Wishlist products' }, 401: errorResponse },
        },
      },
      '/api/wishlist/toggle': {
        post: {
          tags: ['Wishlist'],
          summary: 'Toggle a product in wishlist via request body',
          security: bearerSecurity,
          responses: { 200: { description: 'Updated wishlist state' } },
        },
      },
      '/api/wishlist/{productId}': {
        post: {
          tags: ['Wishlist'],
          summary: 'Toggle a product in wishlist via path parameter',
          security: bearerSecurity,
          parameters: [productIdPathParam],
          responses: { 200: { description: 'Updated wishlist state' } },
        },
        delete: {
          tags: ['Wishlist'],
          summary: 'Remove a product from wishlist',
          security: bearerSecurity,
          parameters: [productIdPathParam],
          responses: { 200: { description: 'Removed from wishlist' } },
        },
      },

      // ---- Media ----
      '/api/media/upload': {
        post: {
          tags: ['Media'],
          summary: 'Upload a product image (Admin, multipart/form-data field "image")',
          security: bearerSecurity,
          responses: { 200: { description: 'Sanitized WebP image URL returned' }, 400: errorResponse, 403: errorResponse },
        },
      },
      '/api/media/avatar': {
        post: {
          tags: ['Media'],
          summary: 'Upload user avatar (multipart/form-data field "image")',
          security: bearerSecurity,
          responses: { 200: { description: 'Sanitized WebP avatar URL returned' }, 400: errorResponse, 401: errorResponse },
        },
      },

      // ---- Analytics ----
      '/api/analytics/dashboard': {
        get: {
          tags: ['Analytics'],
          summary: 'Get net revenue, order stats, best sellers & sales timeline (Admin)',
          security: bearerSecurity,
          responses: { 200: { description: 'Dashboard metrics' }, 403: errorResponse },
        },
      },
      '/api/analytics/audit-logs': {
        get: {
          tags: ['Analytics'],
          summary: 'Query admin and security audit logs (Admin)',
          security: bearerSecurity,
          responses: { 200: { description: 'Paginated audit logs' }, 403: errorResponse },
        },
      },

      // ---- AI ----
      '/api/ai/status': {
        get: {
          tags: ['AI'],
          summary: 'Check whether an AI provider is configured',
          responses: { 200: { description: 'AI provider readiness status' } },
        },
      },
      '/api/ai/chat': {
        post: {
          tags: ['AI'],
          summary: 'Chat with the UCONEXT AI Shopping Concierge (tool-calling against live catalog)',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AiChatRequest' } } },
          },
          responses: {
            200: { description: 'AI reply with optional product, coupon, order, or comparison cards' },
            400: errorResponse,
            503: errorResponse,
          },
        },
      },
      '/api/ai/history': {
        get: {
          tags: ['AI'],
          summary: 'Get saved AI chat history for signed-in user',
          security: bearerSecurity,
          responses: { 200: { description: 'Chat history' }, 401: errorResponse },
        },
        delete: {
          tags: ['AI'],
          summary: 'Clear saved AI chat history',
          security: bearerSecurity,
          responses: { 200: { description: 'Chat history cleared' }, 401: errorResponse },
        },
      },
      '/api/ai/products/{productId}/summary': {
        get: {
          tags: ['AI'],
          summary: 'Generate AI review pros/cons summary for a product',
          parameters: [productIdPathParam],
          responses: { 200: { description: 'AI review insights' }, 404: errorResponse },
        },
      },
    },
  };
}
