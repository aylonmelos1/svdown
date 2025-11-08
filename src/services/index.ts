import { ShopeeService } from './shopeeService';
import { PinterestService } from './pinterestService';
import { TiktokService } from './tiktokService';
import YoutubeService from './youtubeService';
import { MetaService } from './metaService';
import { MercadoLivreService } from './mercadoLivreService';
import type { ResolveService } from './types';

export const services: ResolveService[] = [
    new ShopeeService(),
    new PinterestService(),
    new TiktokService(),
    new YoutubeService(),
    new MetaService(),
    new MercadoLivreService(),
];
