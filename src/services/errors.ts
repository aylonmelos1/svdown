import type { SupportedService } from './types';

export class ServiceAvailabilityError extends Error {
    public readonly service: SupportedService;
    public readonly detail?: string;
    public readonly statusCode: number;

    constructor(service: SupportedService, message: string, detail?: string, statusCode = 503) {
        super(message);
        this.name = 'ServiceAvailabilityError';
        this.service = service;
        this.detail = detail;
        this.statusCode = statusCode;
    }
}
