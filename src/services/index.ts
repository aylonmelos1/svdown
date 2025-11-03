import { ShopeeService } from './shopeeService';
import { PinterestService } from './pinterestService';
import { TiktokService } from './tiktokService';
import { YoutubeService } from './youtubeService';

export const services = [
    new ShopeeService(),
    new PinterestService(),
    new TiktokService(),
    new YoutubeService(),
];
