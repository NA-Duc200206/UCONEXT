import { Router } from 'express';
import { productController } from '../controllers/productController';
import { authenticateToken, isAdmin, optionalAuthenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  listProductsQuerySchema,
  recommendedProductsQuerySchema,
  createProductSchema,
  updateProductSchema,
} from '../schemas/product';
import { idParamSchema } from '../schemas/common';

const router = Router();

router.get('/', validate({ query: listProductsQuerySchema }), productController.getAll);
router.get('/recommended', optionalAuthenticateToken, validate({ query: recommendedProductsQuerySchema }), productController.getRecommended);
router.get('/:id', validate({ params: idParamSchema }), productController.getById);
router.post('/', authenticateToken, isAdmin, validate({ body: createProductSchema }), productController.create);
router.put('/:id', authenticateToken, isAdmin, validate({ params: idParamSchema, body: updateProductSchema }), productController.update);
router.delete('/:id', authenticateToken, isAdmin, validate({ params: idParamSchema }), productController.delete);

export default router;
