const MAX_DURATION_SECONDS = 48 * 60 * 60;
const MAX_DURATION_MILLISECONDS = MAX_DURATION_SECONDS * 1000;
const MAX_DURATION_MICROSECONDS = MAX_DURATION_MILLISECONDS * 1000;

const SECOND_PRIORITY_FIELDS = ['durationVideo', 'durationAudio', 'durationSeconds'];
const MILLISECOND_FIELDS = ['durationMs', 'durationMilliseconds'];

function getMediaSpecificExtra(extras, mediaType) {
    if (!extras || typeof extras !== 'object') {
        return null;
    }
    const key = mediaType === 'audio' ? 'durationAudio' : 'durationVideo';
    if (typeof extras[key] === 'number' || typeof extras[key] === 'string') {
        return extras[key];
    }
    return null;
}

export function extractMediaDurationSeconds(data, mediaType) {
    if (!data) return null;
    const service = (data?.service || '').toString().toLowerCase();
    const extras = data?.extras || {};
    const pageProps = data?.pageProps || {};
    const mediaInfo = pageProps?.mediaInfo || {};
    const videoInfo = mediaInfo?.video || {};
    const treatPagePropsAsMilliseconds = service === 'shopee';

    const candidates = [
        { value: getMediaSpecificExtra(extras, mediaType), unit: 'seconds' },
        { value: extras?.duration, unit: 'seconds' },
        ...SECOND_PRIORITY_FIELDS.map(key => ({ value: extras?.[key], unit: 'seconds' })),
        ...MILLISECOND_FIELDS.map(key => ({ value: extras?.[key], unit: 'milliseconds' })),
        { value: videoInfo.lengthSeconds, unit: 'seconds' },
        { value: videoInfo.durationSeconds, unit: 'seconds' },
        { value: videoInfo.durationMs, unit: 'milliseconds' },
        { value: videoInfo.lengthMs, unit: 'milliseconds' },
        { value: videoInfo.duration, unit: treatPagePropsAsMilliseconds ? 'milliseconds' : 'auto' },
        { value: videoInfo.length, unit: treatPagePropsAsMilliseconds ? 'milliseconds' : 'auto' },
        { value: mediaInfo.duration, unit: treatPagePropsAsMilliseconds ? 'milliseconds' : 'auto' },
        { value: pageProps.duration, unit: treatPagePropsAsMilliseconds ? 'milliseconds' : 'auto' },
        { value: data?.duration, unit: 'auto' },
    ];

    for (const candidate of candidates) {
        const normalized = normalizeDurationCandidate(candidate.value, candidate.unit);
        if (normalized) {
            return normalized;
        }
    }
    return null;
}

function normalizeDurationCandidate(value, unitHint = 'auto') {
    if (value == null) return null;
    if (typeof value === 'number') {
        return normalizeNumericDuration(value, unitHint);
    }
    if (typeof value === 'string') {
        return normalizeStringDuration(value, unitHint);
    }
    return null;
}

function normalizeNumericDuration(value, unitHint) {
    if (!Number.isFinite(value) || value <= 0) {
        return null;
    }
    if (unitHint === 'milliseconds') {
        return clampSeconds(value / 1000);
    }
    if (unitHint === 'auto') {
        if (value > MAX_DURATION_SECONDS && value <= MAX_DURATION_MILLISECONDS) {
            return clampSeconds(value / 1000);
        }
        if (value > MAX_DURATION_MILLISECONDS && value <= MAX_DURATION_MICROSECONDS) {
            return clampSeconds(value / 1_000_000);
        }
    }
    return clampSeconds(value);
}

function normalizeStringDuration(value, unitHint) {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (unitHint === 'milliseconds') {
        const parsed = Number.parseFloat(trimmed.replace(',', '.'));
        if (!Number.isFinite(parsed)) {
            return null;
        }
        return clampSeconds(parsed / 1000);
    }
    return parseDurationToSeconds(trimmed);
}

function clampSeconds(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return null;
    }
    if (seconds > MAX_DURATION_SECONDS) {
        return null;
    }
    return seconds;
}

export function parseDurationToSeconds(value) {
    if (typeof value === 'number') {
        return normalizeNumericDuration(value, 'auto');
    }
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = trimmed.replace(',', '.');
    const numeric = Number.parseFloat(normalized);
    if (Number.isFinite(numeric) && numeric > 0) {
        if (numeric <= MAX_DURATION_SECONDS) {
            return numeric;
        }
        if (numeric <= MAX_DURATION_MILLISECONDS) {
            return clampSeconds(numeric / 1000);
        }
    }
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
        return parseColonDuration(trimmed);
    }
    if (/^PT/i.test(trimmed)) {
        return parseIsoDuration(trimmed);
    }
    return null;
}

function parseColonDuration(value) {
    const parts = value.split(':').map(Number);
    if (parts.some(part => Number.isNaN(part))) return null;
    if (parts.length === 2) {
        const [minutes, seconds] = parts;
        return (minutes * 60) + seconds;
    }
    if (parts.length === 3) {
        const [hours, minutes, seconds] = parts;
        return (hours * 3600) + (minutes * 60) + seconds;
    }
    return null;
}

function parseIsoDuration(value) {
    const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/i);
    if (!match) return null;
    const hours = Number.parseFloat(match[1] || '0');
    const minutes = Number.parseFloat(match[2] || '0');
    const seconds = Number.parseFloat(match[3] || '0');
    return (hours * 3600) + (minutes * 60) + seconds;
}

export function __testables() {
    return {
        normalizeDurationCandidate,
        parseColonDuration,
        parseIsoDuration,
    };
}
