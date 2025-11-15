import Database from 'better-sqlite3';
import { getDatabase } from './sessionStore'; // Re-use the existing database instance
import log from '../log';
import webpush from 'web-push';

export type PushSubscription = {
    endpoint: string;
    expirationTime: number | null;
    keys: {
        p256dh: string;
        auth: string;
    };
};

export async function saveSubscription(subscription: PushSubscription, userIdentifier: string | null = null): Promise<number> {
    const db = getDatabase();
    const subscriptionObject = JSON.stringify(subscription);

    const existingSubscription = db.prepare('SELECT id FROM push_subscriptions WHERE subscription_object = ?').get(subscriptionObject) as { id: number } | undefined;

    if (existingSubscription) {
        log.info(`Existing push subscription found for user_identifier: ${userIdentifier}. ID: ${existingSubscription.id}`);
        return existingSubscription.id;
    }

    const stmt = db.prepare(`
        INSERT INTO push_subscriptions (subscription_object, user_identifier, created_at)
        VALUES (?, ?, CURRENT_TIMESTAMP);
    `);
    const result = stmt.run(subscriptionObject, userIdentifier);
    const newId = result.lastInsertRowid as number;
    log.info(`New push subscription saved for user_identifier: ${userIdentifier}. ID: ${newId}`);

    // Send a welcome notification to the new subscriber
    if (newId > 0) {
        sendWelcomeNotification(subscription);
    }

    return newId;
}

export async function trackNotificationClick(logId: number): Promise<void> {
    const db = getDatabase();

    const transaction = db.transaction(() => {
        const logUpdateStmt = db.prepare(`
            UPDATE notification_log
            SET clicked_at = CURRENT_TIMESTAMP
            WHERE id = ? AND clicked_at IS NULL
            RETURNING subscription_id;
        `);
        const result = logUpdateStmt.get(logId) as { subscription_id: number } | undefined;

        if (!result) {
            log.warn(`Attempted to track click for already clicked or non-existent log ID: ${logId}`);
            return;
        }

        const subscriptionId = result.subscription_id;
        log.info(`Notification click tracked for log ID: ${logId}`);

        const countUpdateStmt = db.prepare(`
            UPDATE push_subscriptions
            SET click_count = click_count + 1
            WHERE id = ?;
        `);
        countUpdateStmt.run(subscriptionId);
        log.info(`Incremented click_count for subscription ID: ${subscriptionId}`);

        // Update the optimal send hour for the user
        updateOptimalSendHour(subscriptionId);
    });

    try {
        transaction();
    } catch (error) {
        log.error(`Failed to process click tracking for log ID ${logId}:`, error);
    }
}

function updateOptimalSendHour(subscriptionId: number) {
    const db = getDatabase();
    // This query groups all clicks for a subscription by the hour of the day (in UTC)
    // and returns the hour with the most clicks.
    const stmt = db.prepare(`
        SELECT strftime('%H', clicked_at) as hour
        FROM notification_log
        WHERE subscription_id = ? AND clicked_at IS NOT NULL
        GROUP BY hour
        ORDER BY COUNT(*) DESC
        LIMIT 1;
    `);
    const result = stmt.get(subscriptionId) as { hour: string } | undefined;

    if (result && result.hour) {
        const optimalHour = parseInt(result.hour, 10);
        if (Number.isInteger(optimalHour)) {
            const updateStmt = db.prepare(`
                UPDATE push_subscriptions
                SET optimal_send_hour = ?
                WHERE id = ?;
            `);
            updateStmt.run(optimalHour, subscriptionId);
            log.info(`Updated optimal send hour for subscription ${subscriptionId} to ${optimalHour}:00 UTC.`);
        }
    }
}

async function sendWelcomeNotification(subscription: PushSubscription) {
    const payload = {
        title: 'Inscrição concluída!',
        body: 'Obrigado por se inscrever! Agora você receberá as notificações de quando seu vídeo ficar pronto.',
        type: 'welcome'
    };
    try {
        await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 86400 });
        log.info('Welcome notification sent successfully.');
    } catch (error) {
        log.error('Error sending welcome notification:', error);
    }
}

export async function sendNotification(payload: any): Promise<void> {
    const db = getDatabase();
    const subscriptions = db.prepare('SELECT * FROM push_subscriptions').all() as any[];

    const notificationPayload = JSON.stringify(payload);
    const options = {
        TTL: 86400 // 1 day in seconds
    };

    for (const subscriptionRow of subscriptions) {
        const subscription = JSON.parse(subscriptionRow.subscription_object);
        try {
            const result = await webpush.sendNotification(subscription, notificationPayload, options);
            log.info(`Notification sent to subscription ID: ${subscriptionRow.id}`, result.statusCode);
            
            const logStmt = db.prepare(`
                INSERT INTO notification_log (subscription_id, content, type)
                VALUES (?, ?, ?);
            `);
            const info = logStmt.run(subscriptionRow.id, payload.title || 'Notification', payload.type || 'general');
            const logId = info.lastInsertRowid;
            log.info(`Notification sent and logged with ID: ${logId}`);

        } catch (error: any) {
            log.error(`Error sending notification to subscription ID: ${subscriptionRow.id}`, error.body);
            if (error.statusCode === 410) {
                db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(subscriptionRow.id);
                log.info(`Subscription ID ${subscriptionRow.id} has expired and was deleted.`);
            }
        }
    }
}

