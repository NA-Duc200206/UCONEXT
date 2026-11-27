import { Router } from 'express';
import { categoryController } from '../controllers/categoryController';
import { authenticateToken, isAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createCategorySchema, updateCategorySchema } from '../schemas/category';
import { idParamSchema } from '../schemas/common';

const router = Router();

router.get('/', categoryController.getAll);
router.post('/', authenticateToken, isAdmin, validate({ body: createCategorySchema }), categoryController.create);
router.put('/:id', authenticateToken, isAdmin, validate({ params: idParamSchema, body: updateCategorySchema }), categoryController.update);
router.delete('/:id', authenticateToken, isAdmin, validate({ params: idParamSchema }), categoryController.delete);

export default router;
