import { ShopeeService } from './shopeeService';
import { PinterestService } from './pinterestService';
import { TiktokService } from './tiktokService';
import { YoutubeService } from './youtubeService';
import type { ResolveService } from './types';

export const services: ResolveService[] = [
    new ShopeeService(),
    new PinterestService(),
    new TiktokService(),
    new YoutubeService(),
];
