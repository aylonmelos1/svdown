import crypto from 'crypto';
import log from '../log';
import { getTrendingProducts, TrendingShopeeProduct } from './shopeeAffiliateService';
import { sendNotification } from './notificationService';
import { getDatabase } from './sessionStore';

type ScheduleLabel = '09h' | '12h' | '18h' | '21h';

type ScheduleSlot = {
    label: ScheduleLabel;
    hour: number;
    minute: number;
    message: string;
};

type ProductPushRecord = {
    id: string;
    title: string;
    shortLink: string;
    imageUrl: string;
    currentPrice: number | null;
    originalPrice: number | null;
    discountPercent: number | null;
};

type ProductPushBatch = {
    batchId: string;
    schedule: ScheduleLabel;
    createdAt: string;
    products: ProductPushRecord[];
};

const PRODUCT_ICON_URL = process.env.PRODUCT_PUSH_ICON_URL || 'https://svdown.tech/icon.svg';
const PRODUCT_BADGE_URL = process.env.PRODUCT_PUSH_BADGE_URL || PRODUCT_ICON_URL;
const PRODUCTS_PER_SLOT = Math.max(1, Number(process.env.PRODUCT_PUSH_PER_SLOT ?? '1'));
const MIN_DISCOUNT_PERCENT = Math.max(0, Number(process.env.PRODUCT_PUSH_MIN_DISCOUNT ?? '20'));
const RUN_INTERVAL_MS = 60_000;

const SCHEDULE_SLOTS: ScheduleSlot[] = [
    { label: '09h', hour: 9, minute: 0, message: 'Comece o dia aproveitando' },
    { label: '12h', hour: 12, minute: 0, message: 'Intervalo com oferta quente' },
    { label: '18h', hour: 18, minute: 0, message: 'Fim de tarde com economia' },
    { label: '21h', hour: 21, minute: 0, message: 'Última chamada de hoje' },
];

let schedulerHandle: NodeJS.Timeout | null = null;
let ticking = false;
let lastDayKey = getDayKey(new Date());
const completedRuns = new Set<string>();
const runningSlots = new Set<ScheduleLabel>();

export function initializeProductPushScheduler() {
    if (process.env.SVDOWN_DISABLE_PRODUCT_PUSH === '1') {
        log.info('[product-push] Scheduler disabled via SVDOWN_DISABLE_PRODUCT_PUSH.');
        return;
    }
    if (schedulerHandle) {
        return;
    }
    log.info('[product-push] Scheduler started.');
    const tickWrapper = () => {
        if (ticking) {
            return;
        }
        ticking = true;
        runTick()
            .catch((error) => {
                log.error('[product-push] Tick failed', error);
            })
            .finally(() => {
                ticking = false;
            });
    };

    schedulerHandle = setInterval(tickWrapper, RUN_INTERVAL_MS);
    tickWrapper();
}

async function runTick() {
    const now = new Date();
    const todayKey = getDayKey(now);
    if (todayKey !== lastDayKey) {
        completedRuns.clear();
        lastDayKey = todayKey;
    }

    for (const slot of SCHEDULE_SLOTS) {
        if (!shouldTriggerSlot(slot, now)) {
            continue;
        }
        await runSlot(slot, todayKey);
    }
}

function shouldTriggerSlot(slot: ScheduleSlot, reference: Date): boolean {
    return reference.getHours() === slot.hour && reference.getMinutes() === slot.minute;
}

async function runSlot(slot: ScheduleSlot, dayKey: string) {
    if (runningSlots.has(slot.label)) {
        return;
    }
    const completionKey = buildCompletionKey(slot.label, dayKey);
    if (completedRuns.has(completionKey)) {
        return;
    }

    runningSlots.add(slot.label);
    let batch: ProductPushBatch | null = null;
    try {
        batch = await buildProductBatch(slot);
        if (!batch) {
            return;
        }
        persistBatchRecord(batch);
        await sendProductBatch(batch, slot);
        markBatchSent(batch.batchId);
        completedRuns.add(completionKey);
        log.info(`[product-push] Batch ${batch.batchId} sent for slot ${slot.label}.`);
    } catch (error) {
        log.error(`[product-push] Failed to send batch for slot ${slot.label}`, error);
        if (batch) {
            persistBatchError(batch.batchId, error instanceof Error ? error.message : String(error));
        }
    } finally {
        runningSlots.delete(slot.label);
    }
}

async function buildProductBatch(slot: ScheduleSlot): Promise<ProductPushBatch | null> {
    const selection = await selectProductsForSlot();
    if (!selection.length) {
        log.warn(`[product-push] No candidate products for slot ${slot.label}.`);
        return null;
    }
    const batch: ProductPushBatch = {
        batchId: crypto.randomUUID(),
        schedule: slot.label,
        createdAt: new Date().toISOString(),
        products: selection,
    };
    return batch;
}

async function selectProductsForSlot(): Promise<ProductPushRecord[]> {
    try {
        const candidates = await getTrendingProducts(12);
        const enriched = candidates
            .map(enrichProduct)
            .filter((product): product is ProductPushRecord => Boolean(product));

        if (!enriched.length) {
            return [];
        }

        const significant = enriched.filter((product) => (product.discountPercent ?? 0) >= MIN_DISCOUNT_PERCENT);
        const prioritized = significant.length ? significant : enriched;
        prioritized.sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0));
        return prioritized.slice(0, PRODUCTS_PER_SLOT);
    } catch (error) {
        log.error('[product-push] Failed to fetch trending products', error);
        return [];
    }
}

function enrichProduct(product: TrendingShopeeProduct): ProductPushRecord | null {
    if (!product?.offer_link) {
        return null;
    }

    const currentPrice = parsePrice(product.price);
    const originalPrice = parsePrice(product.original_price);
    const discountFromData = parseDiscount(product.discount_percent);
    let discountPercent = discountFromData;

    if ((!discountPercent || discountPercent <= 0) && originalPrice && currentPrice && originalPrice > currentPrice) {
        discountPercent = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
    }

    const normalizedTitle = product.name?.trim() || 'Oferta Shopee';
    const id = product.id || crypto.randomUUID();

    return {
        id,
        title: normalizedTitle,
        shortLink: product.offer_link,
        imageUrl: product.image_url,
        currentPrice,
        originalPrice,
        discountPercent,
    };
}

async function sendProductBatch(batch: ProductPushBatch, slot: ScheduleSlot) {
    for (const product of batch.products) {
        const payload = buildNotificationPayload(product, batch.batchId, slot);
        await sendNotification(payload);
    }
}

function buildNotificationPayload(product: ProductPushRecord, batchId: string, slot: ScheduleSlot) {
    const discountLabel = product.discountPercent ? `${product.discountPercent}% OFF` : 'Oferta imperdível';
    const title = `${truncate(product.title, 48)} · ${discountLabel}`;
    const body = buildBodyText(product, slot);

    return {
        title,
        body,
        icon: PRODUCT_ICON_URL,
        badge: PRODUCT_BADGE_URL,
        url: product.shortLink,
        data: {
            url: product.shortLink,
            productId: product.id,
            batchId,
            schedule: slot.label,
        },
        type: 'product_push',
    };
}

function buildBodyText(product: ProductPushRecord, slot: ScheduleSlot): string {
    const priceText = product.currentPrice ? formatCurrency(product.currentPrice) : undefined;
    const baseline = priceText ? `${slot.message} por ${priceText}` : `${slot.message} agora`;
    return `${baseline}. Toque e abra diretamente na Shopee.`;
}

function persistBatchRecord(batch: ProductPushBatch) {
    const db = getDatabase();
    const stmt = db.prepare(`
        INSERT INTO product_push_batches (batch_id, schedule_slot, created_at, payload)
        VALUES (?, ?, ?, ?);
    `);
    stmt.run(batch.batchId, batch.schedule, batch.createdAt, JSON.stringify(batch.products));
}

function markBatchSent(batchId: string) {
    const db = getDatabase();
    db.prepare(`
        UPDATE product_push_batches
        SET sent_at = CURRENT_TIMESTAMP,
            error = NULL
        WHERE batch_id = ?;
    `).run(batchId);
}

function persistBatchError(batchId: string, message: string) {
    const db = getDatabase();
    db.prepare(`
        UPDATE product_push_batches
        SET error = ?, sent_at = NULL
        WHERE batch_id = ?;
    `).run(message.slice(0, 500), batchId);
}

function buildCompletionKey(label: ScheduleLabel, dayKey: string): string {
    return `${dayKey}-${label}`;
}

function getDayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function parsePrice(input?: string | number | null): number | null {
    if (typeof input === 'number' && Number.isFinite(input)) {
        return input;
    }
    if (typeof input !== 'string') {
        return null;
    }
    const normalized = input
        .replace(/[^0-9,.-]/g, '')
        .replace(/\./g, '')
        .replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseDiscount(input?: string | number | null): number | null {
    if (typeof input === 'number' && Number.isFinite(input)) {
        return normalizePercentValue(input);
    }
    if (typeof input !== 'string' || !input.trim()) {
        return null;
    }
    const cleaned = input.replace('%', '').trim();
    const parsed = Number.parseFloat(cleaned);
    if (!Number.isFinite(parsed)) {
        return null;
    }
    return normalizePercentValue(parsed);
}

function normalizePercentValue(value: number): number {
    if (value > 1 && value <= 100) {
        return Math.round(value);
    }
    if (value <= 1) {
        return Math.round(value * 100);
    }
    return Math.round(Math.min(value, 100));
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
});

function formatCurrency(value: number): string {
    return currencyFormatter.format(value);
}

function truncate(value: string, limit: number): string {
    if (value.length <= limit) {
        return value;
    }
    return `${value.slice(0, limit - 1)}…`;
}
