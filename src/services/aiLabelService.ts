import log from '../log';
import { groqClient } from './groqClient';

const DEFAULT_MODEL = (process.env.GROQ_DEFAULT_MODEL || '').trim() || 'llama-3.1-8b-instant';

export async function suggestProductHeadlineFromCaption(caption: string, locale: 'pt' | 'en' = 'pt'): Promise<string | null> {
    if (!caption || !caption.trim()) {
        return null;
    }
    if (!groqClient.isConfigured()) {
        return null;
    }

    const safeCaption = caption.trim().slice(0, 600);
    const systemMessage = locale === 'en'
        ? 'You extract short product names from captions. Reply with at most 5 English words describing the main product. Avoid emojis and punctuation.'
        : 'Você extrai nomes curtos de produtos a partir de legendas. Responda em até 5 palavras em português descrevendo o principal produto citado. Evite emojis e pontuação.';
    const userMessage = locale === 'en'
        ? `Caption:\n"""\n${safeCaption}\n"""\nReturn only the product name.`
        : `Legenda:\n"""\n${safeCaption}\n"""\nRetorne apenas o nome do produto.`;

    try {
        const result = await groqClient.chatCompletion({
            model: DEFAULT_MODEL,
            maxTokens: 32,
            temperature: 0.2,
            messages: [
                { role: 'system', content: systemMessage },
                { role: 'user', content: userMessage },
            ],
        });
        const content = result?.content?.trim();
        if (!content) {
            return null;
        }
        return sanitizeProductHeadline(content);
    } catch (error) {
        log.error('[AI Label] Failed to fetch Groq suggestion', error);
        return null;
    }
}

function sanitizeProductHeadline(value: string): string {
    return value
        .replace(/\s+/g, ' ')
        .replace(/[^\p{L}\p{N}\s\-&]/gu, '')
        .trim()
        .slice(0, 80);
}
