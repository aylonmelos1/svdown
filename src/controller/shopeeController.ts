import { Request, Response } from 'express';
import { getTrendingProducts } from '../services/shopeeAffiliateService';
import log from '../log';

export async function trendingProducts(req: Request, res: Response) {
  try {
    const products = await getTrendingProducts();
    res.json(products);
  } catch (error) {
    log.error('Failed to get trending products:', error);
    res.status(500).json({ error: 'Failed to fetch trending products from Shopee' });
  }
}
