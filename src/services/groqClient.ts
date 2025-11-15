import axios, { AxiosInstance } from 'axios';
import log from '../log';

export interface GroqChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface GroqChatCompletionOptions {
    model?: string;
    messages: GroqChatMessage[];
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    stop?: string[];
    timeoutMs?: number;
}

export interface GroqChatCompletionResult {
    id: string;
    model: string;
    content: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    raw?: unknown;
}

const DEFAULT_GROQ_ENDPOINT = 'https://api.groq.com/openai/v1';

export class GroqClient {
    private readonly apiKey: string | undefined;
    private readonly http: AxiosInstance;

    constructor(apiKey = process.env.GROQ_API_KEY, baseURL = DEFAULT_GROQ_ENDPOINT) {
        this.apiKey = apiKey;
        this.http = axios.create({
            baseURL,
            timeout: 10000,
        });
    }

    public isConfigured(): boolean {
        return Boolean(this.apiKey);
    }

    public async chatCompletion(options: GroqChatCompletionOptions): Promise<GroqChatCompletionResult | null> {
        if (!this.isConfigured()) {
            log.warn('[GroqClient] GROQ_API_KEY not configured. Skipping chatCompletion call.');
            return null;
        }

        const payload = {
            model: options.model || 'llama3-8b-8192',
            messages: options.messages,
            temperature: typeof options.temperature === 'number' ? options.temperature : 0.2,
            max_tokens: options.maxTokens ?? 256,
            top_p: typeof options.topP === 'number' ? options.topP : 1,
            stop: options.stop,
        };

        try {
            const response = await this.http.post(
                '/chat/completions',
                payload,
                {
                    headers: {
                        Authorization: `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: options.timeoutMs ?? 12000,
                },
            );

            const firstChoice = response.data?.choices?.[0];
            const content = firstChoice?.message?.content?.trim();
            if (!content) {
                return null;
            }

            return {
                id: response.data?.id,
                model: response.data?.model,
                content,
                usage: response.data?.usage,
                raw: response.data,
            };
        } catch (error) {
            log.error('[GroqClient] chatCompletion failed', error);
            return null;
        }
    }
}

export const groqClient = new GroqClient();
