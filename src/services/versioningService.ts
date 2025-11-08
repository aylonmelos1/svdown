import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import log from '../log';

const assetHashes = new Map<string, string>();

function calculateHash(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('md5');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex').slice(0, 16);
}

export function initializeAssetVersioning(viewPath: string): void {
    try {
        log.info('Initializing asset versioning...');
        const cssPath = path.join(viewPath, 'styles.css');
        const jsPath = path.join(viewPath, 'script.js');

        const cssHash = calculateHash(cssPath);
        const jsHash = calculateHash(jsPath);

        assetHashes.set('styles.css', cssHash);
        assetHashes.set('script.js', jsHash);

        log.info(`Asset hashes calculated: styles.css?v=${cssHash}, script.js?v=${jsHash}`);
    } catch (error) {
        log.error('Failed to initialize asset versioning:', error);
        // Em caso de erro, o app ainda pode funcionar, mas sem o cache busting.
    }
}

export function getVersionedAssetTags(): string {
    const cssHash = assetHashes.get('styles.css');
    const jsHash = assetHashes.get('script.js');

    if (!cssHash || !jsHash) {
        // Fallback para o caso de o hashing ter falhado
        return `
            <link rel="preload" href="/styles.css" as="style">
            <link rel="stylesheet" href="/styles.css">
            <script src="/script.js" defer></script>
        `;
    }

    return `
        <link rel="preload" href="/styles.css?v=${cssHash}" as="style">
        <link rel="stylesheet" href="/styles.css?v=${cssHash}">
        <script src="/script.js?v=${jsHash}" defer></script>
    `;
}
