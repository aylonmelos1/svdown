import { extractMediaDurationSeconds } from './duration.mjs';

// === Analytics helpers (GTM) ===
window.dataLayer = window.dataLayer || [];
function dl(eventName, params = {}) {
    window.dataLayer.push({ event: eventName, ...params });
}
async function sha256Hex(str) {
    const enc = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
// ===============================

const resolverSection = document.getElementById('resolver-form');
const input = document.getElementById('link-input');

const resultSection = document.getElementById('result-section');
const shopeeCard = document.getElementById('shopee-card');
const genericCard = document.getElementById('generic-card');
const videoElement = document.getElementById('video-player');
const genericVideoElement = document.getElementById('generic-video-player');
const creatorName = document.getElementById('creator-name');
const genericTitle = document.getElementById('generic-title');
const videoCaption = document.getElementById('video-caption');
const captionBubble = document.getElementById('caption-hint');
const genericCaptionWrapper = document.getElementById('generic-caption-wrapper');
const genericCaption = document.getElementById('generic-caption');
const genericCaptionBubble = document.getElementById('generic-caption-hint');
const likeCount = document.getElementById('like-count');
const commentCount = document.getElementById('comment-count');
const downloadLink = document.getElementById('download-link');
const genericDownloadVideo = document.getElementById('generic-download-video');
const genericDownloadAudio = document.getElementById('generic-download-audio');
const genericBrowserVideo = document.getElementById('generic-browser-video');
const genericBrowserAudio = document.getElementById('generic-browser-audio');
const ytdownContainer = document.getElementById('ytdown-option');
const ytdownLoadButton = document.getElementById('ytdown-load');
const ytdownPanel = document.getElementById('ytdown-panel');
const ytdownSelect = document.getElementById('ytdown-select');
const ytdownSize = document.getElementById('ytdown-size');
const ytdownStatus = document.getElementById('ytdown-status');
const ytdownDownloadButton = document.getElementById('ytdown-download');
const ytdownCancelButton = document.getElementById('ytdown-cancel');
const ytdownTitle = document.getElementById('ytdown-title');
const ytdownHint = document.getElementById('ytdown-hint');
const shareLink = document.getElementById('share-link');
const loader = document.getElementById('loading-indicator');
const loaderText = document.getElementById('loading-text');
const resolveButton = document.getElementById('resolve-button');
const toast = document.getElementById('toast');
const metadataToast = document.getElementById('metadata-toast');
const metadataToastText = metadataToast?.querySelector('.metadata-toast__text') || null;
const donationToast = document.getElementById('donation-toast');
const donationToastTitle = donationToast?.querySelector('[data-donation-toast-title]') || null;
const donationToastSubtitle = donationToast?.querySelector('[data-donation-toast-subtitle]') || null;
const donationToastCount = donationToast?.querySelector('[data-donation-toast-count]') || null;
const donationBlocks = document.querySelectorAll('.donation-blurb[data-pix-key]');
const newDownloadButton = document.getElementById('new-download');
const genericNewDownload = document.getElementById('generic-new-download');
const donationModal = document.querySelector('[data-pix-modal]');
const donationModalDialog = donationModal?.querySelector('.donation-modal__dialog') || null;
const donationModalAmountInput = donationModal?.querySelector('[data-pix-amount]') || null;
const donationModalFeedback = donationModal?.querySelector('[data-pix-amount-feedback]') || null;
const donationModalPayloadDisplay = donationModal?.querySelector('[data-pix-display-payload]') || null;
const donationModalPayloadBubble = donationModal?.querySelector('[data-pix-payload-bubble]') || null;
const donationModalQrWrapper = donationModal?.querySelector('[data-pix-qr]') || null;
const donationModalQrImage = donationModalQrWrapper?.querySelector('[data-pix-qr-image]') || null;
const donationModalDismissTriggers = donationModal ? donationModal.querySelectorAll('[data-pix-dismiss]') : [];
const donationModalQuickButtons = donationModal ? donationModal.querySelectorAll('[data-pix-quick]') : [];
const statsSection = document.getElementById('user-stats');
const statsStatus = statsSection?.querySelector('[data-stat-status]') || null;
const statsValues = {
    downloads: statsSection?.querySelector('[data-stat-value="downloads"]') || null,
    platform: statsSection?.querySelector('[data-stat-value="platform"]') || null,
    duration: statsSection?.querySelector('[data-stat-value="duration"]') || null,
};
const statsHints = {
    downloads: statsSection?.querySelector('[data-stat-hint="downloads"]') || null,
    platform: statsSection?.querySelector('[data-stat-hint="platform"]') || null,
    duration: statsSection?.querySelector('[data-stat-hint="duration"]') || null,
};
const statsLabels = {
    downloads: statsSection?.querySelector('[data-stat-card="downloads"] .user-stats__label') || null,
    platform: statsSection?.querySelector('[data-stat-card="platform"] .user-stats__label') || null,
    duration: statsSection?.querySelector('[data-stat-card="duration"] .user-stats__label') || null,
};
const statsTitle = statsSection?.querySelector('.user-stats__title') || null;
let toastTimer;
let metadataToastTimer;
let donationToastTimer;
let donationToastHideTimer;
const captionBubbleTimers = new WeakMap();
let lastFocusedElement = null;
const USER_ID_STORAGE_KEY = 'svdown.uid';
const USER_ID_COOKIE_NAME = 'svdown_uid';
const DOWNLOAD_COUNT_STORAGE_KEY = 'svdown.downloadCount';
const DONATION_REMINDER_THRESHOLD = 3;
const initialDownloadCount = readStoredDownloadCount();

const state = {
    media: {
        service: null,
        video: null,
        audio: null,
        shareUrl: null,
        pageProps: null,
        title: null,
        description: null,
        extras: null,
        videoDurationSeconds: null,
        audioDurationSeconds: null,
    },
    linkHash: '',
    lastResolvedLink: '',
    resolveStartTime: 0,
    userId: '',
    downloadCount: initialDownloadCount,
    stats: null,
};

const ytdownState = {
    linkHash: '',
    items: [],
    pollingTimer: null,
    activeMediaUrl: '',
};

const donationContext = {
    key: '',
    normalizedKey: '',
    name: 'SVDOWN',
    city: 'ILHEUS',
    reference: 'SVDOWN',
    payload: '',
    lastValidAmount: 0,
    rawAmountInput: '',
    defaultAmount: ''
};

const lang = document.body?.dataset?.lang || 'pt';
const translations = {
    pt: {
        downloadVideo: 'Baixar vídeo',
        downloading: 'Baixando...',
        downloadAudio: 'Baixar áudio (MP3)',
        preparingMp3: 'Preparando MP3...',
        enterLink: 'Informe um link.',
        resolvingLink: 'Resolvendo link...',
        resolveFailed: 'Não foi possível resolver o link.',
        resolveSuccess: 'Link resolvido com sucesso!',
        mediaFound: 'Mídia encontrada',
        noDownloadAvailable: 'Nenhum arquivo disponível para download.',
        preparingAudio: 'Preparando áudio...',
        preparingDownload: 'Preparando download...',
        downloadStartError: 'Falha ao iniciar download.',
        metadataCleanFailed: 'Não foi possível remover os metadados do vídeo.',
        metadataCleanSuccess: 'Arquivo livre de metadados',
        audioConvertFailed: 'Não foi possível converter o áudio para MP3.',
        downloadComplete: 'Download concluído! Confira sua pasta de downloads.',
        downloadFailed: 'Não foi possível baixar o arquivo.',
        browserDownloadVideo: 'Abrir no navegador',
        browserDownloadAudio: 'Abrir áudio no navegador',
        browserDownloadStarted: 'Abrimos o link direto em uma nova aba. Se o download não começar, use "Salvar como".',
        browserDownloadPopupBlocked: 'O navegador bloqueou a abertura do link. Permita pop-ups ou use o download padrão.',
        browserDownloadUnavailable: 'Link direto indisponível agora.',
        ytdownTitle: 'Modo alternativo (YouTube)',
        ytdownHint: 'Download direto do provedor original, sem limpar metadados.',
        ytdownLoadOptions: 'Carregar opções alternativas',
        ytdownLoading: 'Buscando opções...',
        ytdownNoOptions: 'Não encontramos formatos disponíveis agora.',
        ytdownSelectLabel: 'Escolha o formato disponível',
        ytdownSizeLabel: 'Tamanho aproximado:',
        ytdownDownloadCta: 'Baixar via modo alternativo',
        ytdownPreparing: 'Preparando...',
        ytdownProgress: 'Progresso: {{percent}} · {{size}}',
        ytdownCompleted: 'Arquivo pronto! Abrindo download...',
        ytdownError: 'Não foi possível usar o modo alternativo agora.',
        ytdownUnavailable: 'O modo alternativo só funciona para links do YouTube.',
        ytdownDirectOpen: 'Abrimos o arquivo em uma nova aba. Se nada acontecer, copie o link e cole no seu navegador.',
        browserDownloadConfirmVideo: 'Vamos abrir o vídeo diretamente no seu navegador em uma nova aba. Deseja continuar?',
        browserDownloadConfirmAudio: 'Vamos abrir o áudio diretamente no seu navegador em uma nova aba. Deseja continuar?',
        readyForAnother: 'Pronto para baixar outro vídeo!',
        legendCopiedFeedback: 'Legenda copiada para a área de transferência!',
        legendCopiedToast: 'Legenda copiada!',
        legendCopyFailed: 'Não foi possível copiar a legenda.',
        legendUnavailable: 'Nenhuma legenda disponível para copiar.',
        clickToCopy: 'Clique para copiar',
        copied: 'Copiado!',
        pixCopyFeedback: 'Chave PIX copiada. Obrigado pelo apoio!',
        pixCopyToast: 'Chave PIX copiada! Obrigado pelo apoio ❤',
        pixCopyFailed: 'Não foi possível copiar a chave PIX.',
        pixPayloadCopyFeedback: 'Código PIX copiado. Obrigado pelo apoio!',
        pixPayloadCopyToast: 'Código PIX copiado! Obrigado pelo apoio ❤',
        pixPayloadCopyFailed: 'Não foi possível copiar o código PIX.',
        pixPayloadUnavailable: 'Não foi possível preparar o código PIX no momento.',
        pixPayloadPlaceholder: 'Informe um valor para gerar o código PIX.',
        donationToastTitle: 'Curtiu baixar sem marca d’água?',
        donationToastSubtitle: 'Doe e mantenha o SVDown gratuito 💚',
        donationToastTitleReminder: 'Valeu por confiar no SVDown!',
        donationToastSubtitleReminder: 'Você já baixou {{count}} vídeos de graça. Doe e ajude a manter o SVDown gratuito 💚.',
        donationToastCountSingular: 'Primeiro download gratuito!',
        donationToastCountPlural: '{{count}} downloads gratuitos',
        donationToastAria: 'Abrir modal para fazer uma doação',
        pixAmountInvalid: 'Valor inválido. Use números e até duas casas decimais.',
        pixAmountReady: 'Código atualizado para {{value}}.',
        pixAmountReadyNoValue: 'Código gerado sem valor definido. Você pode informar no app do banco.',
        processing: 'Processando...',
        unknownCreator: 'Criador desconhecido',
        noDescription: 'Sem descrição definida.',
        userStatsTitleOwn: 'Seu impacto gratuito',
        userStatsTitleCommunity: 'O quanto os usuários já baixaram',
        userStatsLoading: 'Atualizando métricas…',
        userStatsError: 'Não foi possível carregar agora.',
        userStatsStatusOwn: 'Dados deste navegador',
        userStatsStatusCommunity: 'Dados recentes da comunidade',
        userStatsDownloadsLabel: 'Vídeos baixados',
        userStatsDownloadsHintOwn: 'Seus downloads gratuitos',
        userStatsDownloadsHintGlobal: 'Total da comunidade',
        userStatsPlatformLabel: 'Plataforma preferida',
        userStatsPlatformHintOwn: 'Baseado em {{count}} downloads seus',
        userStatsPlatformHintGlobal: 'Baseado em {{count}} downloads da comunidade',
        userStatsPlatformHintWaiting: 'Aguardando seus downloads',
        userStatsPlatformHintGlobalEmpty: 'Ainda sem dados suficientes da comunidade',
        userStatsPlatformEmpty: 'Sem dados ainda',
        userStatsDurationLabel: 'Tempo de vídeo baixado',
        userStatsDurationHintOwn: 'Seu tempo acumulado',
        userStatsDurationHintGlobal: 'Tempo acumulado da comunidade',
        userStatsDurationEmpty: '0 s'
    },
    en: {
        downloadVideo: 'Download video',
        downloading: 'Downloading...',
        downloadAudio: 'Download audio (MP3)',
        preparingMp3: 'Preparing MP3...',
        enterLink: 'Enter a link.',
        resolvingLink: 'Resolving link...',
        resolveFailed: 'We could not resolve the link.',
        resolveSuccess: 'Link resolved successfully!',
        mediaFound: 'Media found',
        noDownloadAvailable: 'No file available for download.',
        preparingAudio: 'Preparing audio...',
        preparingDownload: 'Preparing download...',
        downloadStartError: 'Failed to start the download.',
        metadataCleanFailed: 'Could not remove video metadata.',
        metadataCleanSuccess: 'Metadata removed successfully!',
        audioConvertFailed: 'Could not convert the audio to MP3.',
        downloadComplete: 'Download complete! Check your downloads folder.',
        downloadFailed: 'Could not download the file.',
        browserDownloadVideo: 'Open in my browser',
        browserDownloadAudio: 'Open the audio in my browser',
        browserDownloadStarted: 'Opened the direct link in a new tab. Use "Save as" if it does not start automatically.',
        browserDownloadPopupBlocked: 'Your browser blocked the new tab. Allow pop-ups or use the standard download.',
        browserDownloadUnavailable: 'Direct link unavailable right now.',
        ytdownTitle: 'Alternate mode (YouTube)',
        ytdownHint: 'Direct download from the source provider. Metadata is not cleaned.',
        ytdownLoadOptions: 'Load alternate options',
        ytdownLoading: 'Fetching options...',
        ytdownNoOptions: 'No formats available right now.',
        ytdownSelectLabel: 'Choose a format',
        ytdownSizeLabel: 'Approximate size:',
        ytdownDownloadCta: 'Download via alternate mode',
        ytdownPreparing: 'Preparing...',
        ytdownProgress: 'Progress: {{percent}} · {{size}}',
        ytdownCompleted: 'File is ready! Opening download...',
        ytdownError: 'Could not use the alternate mode now.',
        ytdownUnavailable: 'The alternate mode is only available for YouTube links.',
        ytdownDirectOpen: 'We opened the download in a new tab. If nothing happens, copy and paste the link in your browser.',
        browserDownloadConfirmVideo: 'We will open the video directly in your browser in a new tab. Continue?',
        browserDownloadConfirmAudio: 'We will open the audio directly in your browser in a new tab. Continue?',
        readyForAnother: 'Ready to grab another video!',
        legendCopiedFeedback: 'Caption copied to your clipboard!',
        legendCopiedToast: 'Caption copied!',
        legendCopyFailed: 'Could not copy the caption.',
        legendUnavailable: 'No caption available to copy.',
        clickToCopy: 'Click to copy',
        copied: 'Copied!',
        pixCopyFeedback: 'PIX key copied. Thanks for the support!',
        pixCopyToast: 'PIX key copied! Thanks for the support ❤',
        pixCopyFailed: 'Could not copy the PIX key.',
        pixPayloadCopyFeedback: 'PIX payload copied. Thanks for the support!',
        pixPayloadCopyToast: 'PIX payload copied! Thanks for the support ❤',
        pixPayloadCopyFailed: 'Could not copy the PIX payload.',
        pixPayloadUnavailable: 'We could not prepare the PIX payload right now.',
        pixPayloadPlaceholder: 'Enter an amount to generate the PIX code.',
        donationToastTitle: 'Enjoying the clean downloads?',
        donationToastSubtitle: 'Donate to keep SVDown free 💜',
        donationToastTitleReminder: 'Thanks for trusting SVDown!',
        donationToastSubtitleReminder: 'You have downloaded {{count}} videos for free. Chip in to keep us online.',
        donationToastCountSingular: '{{count}} free download',
        donationToastCountPlural: '{{count}} free downloads',
        donationToastAria: 'Open the donation modal',
        pixAmountInvalid: 'Invalid amount. Use numbers with up to two decimal places.',
        pixAmountReady: 'PIX code updated for {{value}}.',
        pixAmountReadyNoValue: 'PIX code generated without a predefined amount. You can set it in your banking app.',
        processing: 'Processing...',
        unknownCreator: 'Unknown creator',
        noDescription: 'No caption available.',
        userStatsTitleOwn: 'Your free impact',
        userStatsTitleCommunity: 'What the community has downloaded',
        userStatsLoading: 'Updating metrics…',
        userStatsError: 'Unable to load now.',
        userStatsStatusOwn: 'This browser only',
        userStatsStatusCommunity: 'Community-wide data',
        userStatsDownloadsLabel: 'Videos downloaded',
        userStatsDownloadsHintOwn: 'Your free downloads',
        userStatsDownloadsHintGlobal: 'Community total',
        userStatsPlatformLabel: 'Top platform',
        userStatsPlatformHintOwn: 'Based on {{count}} of your downloads',
        userStatsPlatformHintGlobal: 'Based on {{count}} community downloads',
        userStatsPlatformHintWaiting: 'Start downloading to unlock this',
        userStatsPlatformHintGlobalEmpty: 'Not enough community data yet',
        userStatsPlatformEmpty: 'No data yet',
        userStatsDurationLabel: 'Total video time',
        userStatsDurationHintOwn: 'Your total download time',
        userStatsDurationHintGlobal: 'Community total time',
        userStatsDurationEmpty: '0 s'
    }
};

function getDurationSecondsForMedia(mediaType) {
    if (mediaType === 'audio') {
        return state.media.audioDurationSeconds ?? state.media.videoDurationSeconds ?? null;
    }
    return state.media.videoDurationSeconds ?? state.media.audioDurationSeconds ?? null;
}

donationContext.defaultAmount = lang === 'en' ? '10.00' : '10,00';

const tr = (key) => {
    const table = translations[lang] || translations.pt;
    return table[key] ?? translations.pt[key] ?? key;
};

const formatMessage = (key, replacements = {}) => {
    let template = tr(key) || '';
    Object.entries(replacements).forEach(([token, value]) => {
        const pattern = new RegExp(`{{\\s*${token}\\s*}}`, 'g');
        template = template.replace(pattern, String(value));
    });
    return template;
};

const numberFormatter = new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'pt-BR');

const serviceDisplayNames = {
    shopee: {
        pt: 'Shopee Vídeo',
        en: 'Shopee Video',
    },
    tiktok: {
        pt: 'TikTok',
        en: 'TikTok',
    },
    pinterest: {
        pt: 'Pinterest',
        en: 'Pinterest',
    },
    youtube: {
        pt: 'YouTube',
        en: 'YouTube',
    },
    meta: {
        pt: 'Instagram / Facebook',
        en: 'Instagram / Facebook',
    },
};

ensureUserId();
initUserStatsDashboard();

if (!resolverSection || !input || !resolveButton || !resultSection || !videoElement || !videoCaption || !downloadLink) {
    console.warn('SVDown: elementos essenciais não encontrados, script abortado.');
} else {
    const downloadButtonCtrl = initDownloadButton(downloadLink, tr('downloadVideo'), tr('downloading'));
    const genericVideoButtonCtrl = initDownloadButton(genericDownloadVideo, tr('downloadVideo'), tr('downloading'));
    const genericAudioButtonCtrl = initDownloadButton(genericDownloadAudio, tr('downloadAudio'), tr('preparingMp3'));
    const ytdownLoadButtonCtrl = initDownloadButton(ytdownLoadButton, tr('ytdownLoadOptions'), tr('ytdownLoading'));
    const ytdownDownloadButtonCtrl = initDownloadButton(ytdownDownloadButton, tr('ytdownDownloadCta'), tr('ytdownPreparing'));
    setButtonLabel(genericBrowserVideo, tr('browserDownloadVideo'));
    setButtonLabel(genericBrowserAudio, tr('browserDownloadAudio'));
    initYtdownOption(ytdownLoadButtonCtrl, ytdownDownloadButtonCtrl);

    resolveButton.addEventListener('click', () => handleResolve(input.value.trim()));
    downloadLink.addEventListener('click', (event) => handleDownload(event, 'video', downloadButtonCtrl));
    genericDownloadVideo?.addEventListener('click', (event) => handleDownload(event, 'video', genericVideoButtonCtrl));
    genericDownloadAudio?.addEventListener('click', (event) => handleDownload(event, 'audio', genericAudioButtonCtrl));
    genericBrowserVideo?.addEventListener('click', (event) => handleBrowserDirectDownload(event, 'video'));
    genericBrowserAudio?.addEventListener('click', (event) => handleBrowserDirectDownload(event, 'audio'));

    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            resolveButton.click();
        }
    });

    input.addEventListener('paste', (event) => {
        // Get pasted text
        const pastedText = (event.clipboardData || window.clipboardData).getData('text');
        
        // Try to extract a URL from the pasted text
        const extractedUrl = extractUrl(pastedText);

        if (extractedUrl) {
            // If a URL is found, prevent the default paste action
            event.preventDefault();
            
            // Insert only the URL into the input field
            input.value = extractedUrl;
        }
        // If no URL is found, the default paste action is allowed
    });

    videoCaption.addEventListener('click', () => copyCaptionToClipboard(videoCaption, captionBubble));
    videoCaption.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            copyCaptionToClipboard(videoCaption, captionBubble);
        }
    });

    genericCaption?.addEventListener('click', () => copyCaptionToClipboard(genericCaption, genericCaptionBubble));
    genericCaption?.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            copyCaptionToClipboard(genericCaption, genericCaptionBubble);
        }
    });

    newDownloadButton?.addEventListener('click', resetForm);
    genericNewDownload?.addEventListener('click', resetForm);
    donationBlocks.forEach(block => initDonationBlock(block));
    initDonationToast();

    if (donationModal) {
        donationModalDismissTriggers.forEach(trigger => {
            trigger.addEventListener('click', closeDonationModal);
        });
        donationModalAmountInput?.addEventListener('input', handleDonationAmountInput);
        donationModalQuickButtons.forEach(button => {
            button.addEventListener('click', () => selectQuickAmount(button));
        });
        donationModalPayloadDisplay?.addEventListener('click', () => handlePayloadCopy());
        donationModalPayloadDisplay?.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handlePayloadCopy();
            }
        });
        document.addEventListener('keydown', handleDonationModalKeydown);
    }

    tryResolveFromQuery();

    async function handleResolve(linkInput) { // Renamed parameter to linkInput for clarity
        let linkToResolve = extractUrl(linkInput);

        if (!linkToResolve) {
            // If no URL is found, assume the whole input is the link
            linkToResolve = linkInput;
        }

        if (!linkToResolve) {
            showFeedback(tr('enterLink'), true);
            return;
        }

        state.lastResolvedLink = linkToResolve;
        state.resolveStartTime = performance.now();
        state.linkHash = '';
        let domain = '';
        let hasQuery = false;
        try {
            state.linkHash = await sha256Hex(linkToResolve);
            const u = new URL(linkToResolve);
            domain = u.hostname;
            hasQuery = !!u.search;
        } catch (_) {
            // URL inválida não interrompe o fluxo
        }
        dl('paste_link', { link_hash: state.linkHash, domain, has_query: hasQuery, ts: Date.now() });

        const resolvingMessage = tr('resolvingLink');
        setLoading(true, resolvingMessage);
        showFeedback(resolvingMessage);

        try {
            const response = await fetch('/api/resolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ link: linkToResolve }),
            });

            const data = await response.json();
            if (!response.ok) {
                const responseTimeMs = Math.round(performance.now() - state.resolveStartTime);
                const resolveFailedMessage = tr('resolveFailed');
                dl('resolve_error', {
                    link_hash: state.linkHash,
                    error_message: (data && data.error) || resolveFailedMessage,
                    response_time_ms: responseTimeMs
                });
                throw new Error(data?.error || resolveFailedMessage);
            }

            renderServiceResult(data);
            showFeedback(tr('resolveSuccess'));
            updateUrlWithQuery(linkToResolve); // Use linkToResolve here
            
            const responseTimeMs = Math.round(performance.now() - state.resolveStartTime);
            dl('resolve_success', {
                link_hash: state.linkHash,
                response_time_ms: responseTimeMs,
                service: data?.service || 'unknown',
            });

        } catch (error) {
            console.error(error);
            const message = error instanceof Error && error.message ? error.message : tr('resolveFailed');
            const fallback = tr('resolveFailed');
            const displayMessage = lang === 'pt' ? message : fallback;
            showFeedback(displayMessage, true);
            showToast(fallback, true);
            resultSection.classList.add('hidden');
            resetMediaState();
        } finally {
            setLoading(false);
        }
    }

    function renderServiceResult(data) {
        state.media = {
            service: data?.service || null,
            video: data?.video || null,
            audio: data?.audio || null,
            shareUrl: data?.shareUrl || null,
            pageProps: data?.pageProps || null,
            title: data?.title || null,
            description: data?.description || null,
            extras: data?.extras || null,
            videoDurationSeconds: null,
            audioDurationSeconds: null,
        };
        const inferredVideoDuration = extractMediaDurationSeconds(data, 'video');
        const inferredAudioDuration = extractMediaDurationSeconds(data, 'audio');
        state.media.videoDurationSeconds = inferredVideoDuration ?? inferredAudioDuration ?? null;
        state.media.audioDurationSeconds = inferredAudioDuration ?? inferredVideoDuration ?? null;
        if (data?.service === 'shopee') {
            renderShopeeResult(data);
        } else {
            renderGenericResult(data);
        }

        resultSection.classList.remove('hidden');
        if (resultSection) {
            const yOffset = -80; // Offset de 80px para cima
            const y = resultSection.getBoundingClientRect().top + window.pageYOffset + yOffset;
            window.scrollTo({ top: y, behavior: 'smooth' });
        }
    }

    function renderShopeeResult(data) {
        genericCard?.classList.add('hidden');
        shopeeCard?.classList.remove('hidden');
        genericBrowserVideo?.classList.add('hidden');
        genericBrowserAudio?.classList.add('hidden');

        clearVideoElement(genericVideoElement);

        const videoSelection = data?.video;

        if (videoSelection?.url) {
            videoElement.src = videoSelection.url;
            if (data?.thumbnail) {
                videoElement.poster = data.thumbnail;
            } else {
                videoElement.removeAttribute('poster');
            }
            videoElement.load();
        } else {
            clearVideoElement(videoElement);
        }

        const pageProps = data?.pageProps || {};
        const mediaInfo = pageProps?.mediaInfo || {};

        creatorName.textContent = mediaInfo?.userInfo?.videoUserName || data?.title || tr('unknownCreator');
        videoCaption.textContent = mediaInfo?.video?.caption || tr('noDescription');

        const likeCountContainer = likeCount?.parentElement;
        const commentCountContainer = commentCount?.parentElement;
        if (mediaInfo?.count && typeof mediaInfo.count.likeCount === 'number') {
            likeCount.textContent = formatNumber(mediaInfo.count.likeCount);
            commentCount.textContent = formatNumber(mediaInfo.count.commentCount);
            if (likeCountContainer) likeCountContainer.style.display = 'list-item';
            if (commentCountContainer) commentCountContainer.style.display = 'list-item';
        } else {
            if (likeCountContainer) likeCountContainer.style.display = 'none';
            if (commentCountContainer) commentCountContainer.style.display = 'none';
        }

        if (shareLink) {
            const linkTarget = data?.shareUrl || mediaInfo?.video?.shareUrl || mediaInfo?.shareUrl;
            if (linkTarget) {
                shareLink.href = linkTarget;
                shareLink.classList.remove('hidden');
            } else {
                shareLink.classList.add('hidden');
            }
        }

        downloadLink.href = '#';
        downloadButtonCtrl?.reset();

        resetCaptionBubble(captionBubble);
    }

    function renderGenericResult(data) {
        shopeeCard?.classList.add('hidden');
        genericCard?.classList.remove('hidden');

        clearVideoElement(videoElement);
        resetYtdownState(true);

        const videoSelection = data?.video;
        const audioSelection = data?.audio;

        if (genericVideoElement) {
            if (videoSelection?.url) {
                genericVideoElement.src = videoSelection.url;
                if (data?.thumbnail) {
                    genericVideoElement.poster = data.thumbnail;
                } else {
                    genericVideoElement.removeAttribute('poster');
                }
                genericVideoElement.classList.remove('hidden');
                genericVideoElement.load();
            } else {
                clearVideoElement(genericVideoElement);
                genericVideoElement.classList.add('hidden');
            }
        }

        const service = (data?.service || state.media.service || '').toString().toLowerCase();
        const titleText = (data?.title || '').trim();
        let descriptionText = (data?.description || '').trim();
        let headingText = '';

        if (service === 'youtube') {
            headingText = titleText || tr('mediaFound');
            descriptionText = '';
        } else if (!descriptionText && titleText) {
            descriptionText = titleText;
        }

        if (genericTitle) {
            genericTitle.textContent = headingText;
            genericTitle.classList.toggle('hidden', !headingText);
        }

        if (genericCaption) {
            genericCaption.textContent = descriptionText;
        }
        if (genericCaptionWrapper) {
            const hasDescription = Boolean(descriptionText);
            genericCaptionWrapper.classList.toggle('hidden', !hasDescription);
        }
        resetCaptionBubble(genericCaptionBubble);

        const isYouTube = service === 'youtube';

        if (genericDownloadVideo) {
            const hasVideo = Boolean(videoSelection?.url);
            const hideServerVideo = isYouTube || !hasVideo;
            genericDownloadVideo.classList.toggle('hidden', hideServerVideo);
            if (hasVideo && !hideServerVideo) {
                genericVideoButtonCtrl?.reset();
            }
        }

        if (genericDownloadAudio) {
            const hasAudio = Boolean(audioSelection?.url);
            const hideServerAudio = isYouTube || !hasAudio;
            genericDownloadAudio.classList.toggle('hidden', hideServerAudio);
            if (hasAudio && !hideServerAudio) {
                genericAudioButtonCtrl?.reset();
            }
        }

        const supportsBrowserDownload = isYouTube;
        if (genericBrowserVideo) {
            const hasVideo = Boolean(videoSelection?.url);
            genericBrowserVideo.classList.toggle('hidden', !(supportsBrowserDownload && hasVideo));
        }
        if (genericBrowserAudio) {
            const hasAudio = Boolean(audioSelection?.url);
            genericBrowserAudio.classList.toggle('hidden', !(supportsBrowserDownload && hasAudio));
        }

        updateYtdownVisibility(isYouTube);

        shareLink?.classList.add('hidden');
    }
    
        function initYtdownOption(loadCtrl, downloadCtrl) {
            if (!ytdownContainer || !ytdownLoadButton || !ytdownPanel || !ytdownSelect || !ytdownStatus) return;
            if (ytdownTitle) ytdownTitle.textContent = tr('ytdownTitle');
            if (ytdownHint) ytdownHint.textContent = tr('ytdownHint');
            ytdownSelect.setAttribute('aria-label', tr('ytdownSelectLabel'));

            ytdownLoadButton.addEventListener('click', () => {
                if ((state.media?.service || '').toLowerCase() !== 'youtube') {
                    showToast(tr('ytdownUnavailable'), true);
                    return;
                }
                ytdownPanel.classList.remove('hidden');
                ytdownCancelButton?.classList.remove('hidden');
                loadYtdownFormats(loadCtrl);
            });

            ytdownDownloadButton?.addEventListener('click', (event) => {
                event.preventDefault();
                startYtdownDownload(downloadCtrl);
            });

            ytdownCancelButton?.addEventListener('click', () => {
                resetYtdownState(false);
            });

            ytdownSelect.addEventListener('change', () => {
                updateYtdownSelectedSize();
                if (ytdownStatus) {
                    ytdownStatus.textContent = tr('ytdownSelectLabel');
                }
            });
        }

    function updateYtdownVisibility(isYouTube) {
        if (!ytdownContainer) return;
        ytdownContainer.classList.toggle('hidden', !isYouTube);
        if (!isYouTube) {
            resetYtdownState(true);
        }
    }

    function resetYtdownState(clearLink) {
        if (ytdownState.pollingTimer) {
            clearTimeout(ytdownState.pollingTimer);
            ytdownState.pollingTimer = null;
        }
        ytdownState.items = [];
        ytdownState.activeMediaUrl = '';
        if (clearLink) {
            ytdownState.linkHash = '';
        }
        if (ytdownSelect) {
            ytdownSelect.innerHTML = '';
            ytdownSelect.classList.add('hidden');
        }
        ytdownDownloadButton?.classList.add('hidden');
        ytdownCancelButton?.classList.add('hidden');
        if (ytdownSize) {
            ytdownSize.textContent = '';
        }
        if (ytdownStatus) {
            ytdownStatus.textContent = '';
        }
        ytdownPanel?.classList.add('hidden');
    }

    function getCurrentYouTubeLink() {
        if ((state.media?.service || '').toLowerCase() !== 'youtube') return '';
        return state.lastResolvedLink || state.media.shareUrl || '';
    }

    async function loadYtdownFormats(loadCtrl) {
        const sourceUrl = getCurrentYouTubeLink();
        if (!sourceUrl) {
            showToast(tr('ytdownUnavailable'), true);
            return;
        }
        loadCtrl?.setLoading(true);
        if (ytdownStatus) {
            ytdownStatus.textContent = tr('ytdownLoading');
        }
        ytdownSelect?.classList.add('hidden');
        ytdownDownloadButton?.classList.add('hidden');

        try {
            if (ytdownState.items.length && ytdownState.linkHash === state.linkHash) {
                populateYtdownSelect(ytdownState.items);
                if (ytdownStatus) {
                    ytdownStatus.textContent = tr('ytdownSelectLabel');
                }
                ytdownDownloadButton?.classList.remove('hidden');
                ytdownCancelButton?.classList.remove('hidden');
                return;
            }

            const data = await postYtdownProxy(sourceUrl);
            const items = Array.isArray(data?.api?.mediaItems) ? data.api.mediaItems : [];

            if (!items.length) {
                ytdownState.items = [];
                ytdownState.linkHash = state.linkHash;
                if (ytdownStatus) {
                    ytdownStatus.textContent = tr('ytdownNoOptions');
                }
                return;
            }

            ytdownState.items = items;
            ytdownState.linkHash = state.linkHash;
            populateYtdownSelect(items);
            if (ytdownStatus) {
                ytdownStatus.textContent = tr('ytdownSelectLabel');
            }
            ytdownDownloadButton?.classList.remove('hidden');
            ytdownCancelButton?.classList.remove('hidden');
        } catch (error) {
            console.error(error);
            if (ytdownStatus) {
                ytdownStatus.textContent = tr('ytdownError');
            }
            showToast(tr('ytdownError'), true);
        } finally {
            loadCtrl?.reset();
        }
    }

    function populateYtdownSelect(items) {
        if (!ytdownSelect) return;
        ytdownSelect.innerHTML = '';
        const fallbackLabel = lang === 'en' ? 'Option' : 'Opção';

        items.forEach((item) => {
            const mediaUrl = typeof item?.mediaUrl === 'string' ? item.mediaUrl : '';
            if (!mediaUrl) return;
            const option = document.createElement('option');
            option.value = mediaUrl;
            const segments = [];
            if (item?.mediaExtension) segments.push(item.mediaExtension);
            if (item?.mediaQuality) {
                segments.push(item.mediaQuality);
            } else if (item?.mediaRes) {
                segments.push(item.mediaRes);
            }
            const baseLabel = segments.length ? segments.join(' · ') : fallbackLabel;
            const sizeLabel = item?.mediaFileSize ? ` (${item.mediaFileSize})` : '';
            option.textContent = `${baseLabel}${sizeLabel}`;
            if (item?.mediaFileSize) {
                option.dataset.filesize = item.mediaFileSize;
            }
            ytdownSelect.append(option);
        });

        if (ytdownSelect.options.length > 0) {
            ytdownSelect.selectedIndex = 0;
            ytdownSelect.classList.remove('hidden');
            updateYtdownSelectedSize();
        }
    }

    function updateYtdownSelectedSize() {
        if (!ytdownSelect || !ytdownSize) return;
        const selected = ytdownSelect.options[ytdownSelect.selectedIndex];
        const size = selected?.dataset?.filesize || '';
        ytdownSize.textContent = size ? `${tr('ytdownSizeLabel')} ${size}` : '';
    }

    async function startYtdownDownload(downloadCtrl) {
        if (!ytdownSelect) return;
        const mediaUrl = ytdownSelect.value;
        if (!mediaUrl) {
            showToast(tr('ytdownNoOptions'), true);
            return;
        }
        ytdownState.activeMediaUrl = mediaUrl;
        downloadCtrl?.setLoading(true);
        if (ytdownStatus) {
            ytdownStatus.textContent = tr('ytdownPreparing');
        }
        if (ytdownState.pollingTimer) {
            clearTimeout(ytdownState.pollingTimer);
            ytdownState.pollingTimer = null;
        }
        await pollYtdownProgress(mediaUrl, downloadCtrl);
    }

    async function pollYtdownProgress(mediaUrl, downloadCtrl, attempt = 0) {
        try {
            const data = await postYtdownProxy(mediaUrl);
            const api = data?.api || {};
            if (api.percent === 'Completed' && api.fileUrl) {
                downloadCtrl?.reset();
                if (ytdownStatus) {
                    ytdownStatus.textContent = tr('ytdownCompleted');
                }
                openYtdownFile(api.fileUrl, api.fileName);
                showToast(tr('ytdownDirectOpen'));
                return;
            }
            const percent = api.percent || '...';
            const size = api.fileSize || api.estimatedFileSize || '—';
            if (ytdownStatus) {
                ytdownStatus.textContent = formatMessage('ytdownProgress', {
                    percent,
                    size,
                });
            }
            ytdownState.pollingTimer = window.setTimeout(() => {
                pollYtdownProgress(mediaUrl, downloadCtrl, attempt);
            }, 2000);
        } catch (error) {
            console.error(error);
            if (attempt >= 3) {
                downloadCtrl?.reset();
                if (ytdownStatus) {
                    ytdownStatus.textContent = tr('ytdownError');
                }
                showToast(tr('ytdownError'), true);
                return;
            }
            ytdownState.pollingTimer = window.setTimeout(() => {
                pollYtdownProgress(mediaUrl, downloadCtrl, attempt + 1);
            }, 2000);
        }
    }

    async function postYtdownProxy(targetUrl) {
        const response = await fetch('/api/ytdown/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: targetUrl }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data?.error || 'YTDown proxy error');
        }
        return data;
    }

    function openYtdownFile(fileUrl, fileName) {
        if (!fileUrl) return;
        const anchor = document.createElement('a');
        anchor.href = fileUrl;
        if (fileName) {
            anchor.download = fileName;
        }
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    }

    async function handleDownload(event, mediaType, buttonCtrl) {
        event.preventDefault();
        if (!buttonCtrl) return;

        const selection = mediaType === 'audio' ? state.media.audio : state.media.video;

        if (!selection || !selection.url) {
            const unavailable = tr('noDownloadAvailable');
            showFeedback(unavailable, true);
            showToast(unavailable, true);
            return;
        }

        const loadingMessage = mediaType === 'audio' ? tr('preparingAudio') : tr('preparingDownload');
        setLoading(true, loadingMessage);
        buttonCtrl.setLoading(true, mediaType === 'audio' ? tr('preparingMp3') : undefined);

        try {
            const selectionHash = await safeHash(selection.url);
            if (selectionHash) {
                dl('download_click', {
                    link_hash: selectionHash,
                    ts: Date.now(),
                    media_type: mediaType,
                    service: state.media.service || 'unknown',
                });
            }

            const requestUrl = buildDownloadRequest(selection, mediaType);
            const response = await fetch(requestUrl);
            if (!response.ok) {
                const startError = tr('downloadStartError');
                if (selectionHash) {
                    dl('download_error', {
                        link_hash: selectionHash,
                        error_message: startError,
                        media_type: mediaType,
                        service: state.media.service || 'unknown',
                    });
                }
                throw new Error(startError);
            }

            const metadataHeader = response.headers.get('X-Metadata-Cleaned');
            if (metadataHeader === 'false') {
                showToast(tr('metadataCleanFailed'), true);
            } else if (mediaType === 'video' && metadataHeader === 'true') {
                showMetadataCleanToast();
            }
            const audioHeader = response.headers.get('X-Audio-Transcoded');
            if (audioHeader === 'false') {
                showToast(tr('audioConvertFailed'), true);
            }

            const serverDownloadCount = extractDownloadCountHeader(response);
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const contentDisposition = response.headers.get('Content-Disposition');
            const serverFileName = extractFileNameFromContentDisposition(contentDisposition);
            const downloadName = serverFileName || buildFallbackFileName(selection.fileName, mediaType);
            triggerBrowserDownload(objectUrl, downloadName, mediaType);
            const downloadSuccess = tr('downloadComplete');
            showFeedback(downloadSuccess);
            showToast(downloadSuccess);
            const updatedCount = recordDownloadCount(serverDownloadCount);
            showDonationToast(updatedCount);
            updateLocalStatsAfterDownload(mediaType);

            if (selectionHash) {
                dl('download_complete', {
                    link_hash: selectionHash,
                    success: true,
                    bytes_estimated: blob.size,
                    media_type: mediaType,
                    service: state.media.service || 'unknown',
                });
            }
        } catch (error) {
            console.error(error);
            const fallback = tr('downloadFailed');
            const message = error instanceof Error && error.message ? error.message : fallback;
            const displayMessage = lang === 'pt' ? message : fallback;
            showFeedback(displayMessage, true);
            showToast(displayMessage, true);

            try {
                const selectionHash = await safeHash(selection.url);
                if (selectionHash) {
                    dl('download_error', {
                        link_hash: selectionHash,
                        error_message: message || 'unknown',
                        media_type: mediaType,
                        service: state.media.service || 'unknown',
                    });
                }
            } catch (_) {
                // ignore analytics errors
            }
        } finally {
            buttonCtrl.setLoading(false);
            setLoading(false);
        }
    }

    async function handleBrowserDirectDownload(event, mediaType) {
        if (event) {
            event.preventDefault();
        }

        const confirmKey = mediaType === 'audio' ? 'browserDownloadConfirmAudio' : 'browserDownloadConfirmVideo';
        const allowed = window.confirm(tr(confirmKey));
        if (!allowed) {
            return;
        }

        const selection = mediaType === 'audio' ? state.media.audio : state.media.video;
        if (!selection || !selection.url) {
            const unavailable = tr('browserDownloadUnavailable');
            showFeedback(unavailable, true);
            showToast(unavailable, true);
            return;
        }

        const newWindow = window.open(selection.url, '_blank', 'noopener,noreferrer');
        if (!newWindow) {
            const blocked = tr('browserDownloadPopupBlocked');
            showFeedback(blocked, true);
            showToast(blocked, true);
            return;
        }

        try {
            const selectionHash = await safeHash(selection.url);
            if (selectionHash) {
                dl('browser_download_click', {
                    link_hash: selectionHash,
                    ts: Date.now(),
                    media_type: mediaType,
                    service: state.media.service || 'unknown',
                });
            }
        } catch (_) {
            // ignore analytics errors
        }

        const successMessage = tr('browserDownloadStarted');
        showFeedback(successMessage);
        showToast(successMessage);
        const updatedCount = recordDownloadCount(null);
        showDonationToast(updatedCount);
        updateLocalStatsAfterDownload(mediaType);
    }

    function buildDownloadRequest(selection, mediaType) {
        const params = new URLSearchParams();
        params.set('url', selection.url);
        if (Array.isArray(selection.fallbackUrls)) {
            selection.fallbackUrls.filter(Boolean).forEach(url => params.append('fallback', url));
        }
        if (mediaType === 'audio') {
            params.set('type', 'audio');
        }
        if (state.media.service) {
            params.set('service', state.media.service);
        }
        if (typeof state.media.shareUrl === 'string' && /^https?:\/\//.test(state.media.shareUrl)) {
            params.set('sourceUrl', state.media.shareUrl);
        }
        const durationSeconds = getDurationSecondsForMedia(mediaType);
        if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
            params.set('duration', String(Math.round(durationSeconds)));
        }
        return `/api/download?${params.toString()}`;
    }

    function extractDownloadCountHeader(response) {
        if (!response || typeof response.headers?.get !== 'function') {
            return null;
        }
        const rawValue = response.headers.get('X-Download-Count');
        const parsed = Number.parseInt(rawValue ?? '', 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    }

    function recordDownloadCount(serverValue) {
        const fallbackBase = Number.isFinite(state.downloadCount) ? state.downloadCount : 0;
        const resolved = typeof serverValue === 'number' ? serverValue : fallbackBase + 1;
        state.downloadCount = resolved;
        persistDownloadCount(resolved);
        if (state?.stats?.user) {
            state.stats.user.downloads = Math.max(Number(state.stats.user.downloads) || 0, resolved);
            updateStatsGrid();
        }
        return resolved;
    }

    function formatDownloadCountLabel(count) {
        if (!Number.isFinite(count) || count <= 0) {
            return '';
        }
        const templateKey = count === 1 ? 'donationToastCountSingular' : 'donationToastCountPlural';
        const template = tr(templateKey);
        return template.replace('{{count}}', String(count));
    }

    function resetForm() {
        input.value = '';
        clearVideoElement(videoElement);
        clearVideoElement(genericVideoElement);
        resultSection.classList.add('hidden');
        resetMediaState();
        downloadButtonCtrl?.reset();
        genericVideoButtonCtrl?.reset();
        genericAudioButtonCtrl?.reset();
        shareLink?.classList.add('hidden');
        genericBrowserVideo?.classList.add('hidden');
        genericBrowserAudio?.classList.add('hidden');
        resetYtdownState(true);
        ytdownContainer?.classList.add('hidden');
        state.lastResolvedLink = '';
        updateUrlWithQuery('');
        const ready = tr('readyForAnother');
        showFeedback(ready);
        showToast(ready);
        resetCaptionBubble(captionBubble);
        resetCaptionBubble(genericCaptionBubble);
        if (genericCaptionWrapper) {
            genericCaptionWrapper.classList.add('hidden');
        }
        if (genericCaption) {
            genericCaption.textContent = '';
        }
        if (genericTitle) {
            genericTitle.textContent = '';
            genericTitle.classList.add('hidden');
        }
        if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    function resetMediaState() {
        state.media = {
            service: null,
            video: null,
            audio: null,
            shareUrl: null,
            pageProps: null,
            title: null,
            description: null,
            extras: null,
            videoDurationSeconds: null,
            audioDurationSeconds: null,
        };
    }

    function clearVideoElement(element) {
        if (!element) return;
        try {
            element.pause();
        } catch (_) {
            // ignore
        }
        element.removeAttribute('src');
        element.removeAttribute('poster');
        element.load();
    }

    function showFeedback(message, isError = false) {
        if (!loader || !loaderText) return;
        const spinner = loader.querySelector('.spinner');
        if (spinner) {
            spinner.classList.add('hidden');
        }
        loaderText.textContent = message;
        loader.classList.toggle('error', isError);
        loader.classList.remove('hidden');
    }
    function setLoading(stateValue, message = tr('processing')) {
    if (!loader || !loaderText) return;

    const spinner = loader.querySelector('.spinner');

    if (stateValue) {
        if (spinner) spinner.classList.remove('hidden');
        loader.classList.remove('error');
        if (message) loaderText.textContent = message;
        loader.classList.remove('hidden');
    } else {
        loader.classList.add('hidden');
    }

    resolveButton.disabled = stateValue;
    input.disabled = stateValue;

    const hasVideo = Boolean(state.media.video?.url);
    const hasAudio = Boolean(state.media.audio?.url);

    downloadButtonCtrl?.setDisabled(stateValue || state.media.service !== 'shopee' || !hasVideo);
    genericVideoButtonCtrl?.setDisabled(stateValue || state.media.service === 'shopee' || !hasVideo);
    genericAudioButtonCtrl?.setDisabled(stateValue || !hasAudio);
    const supportsBrowserDownloads = (state.media.service || '').toString().toLowerCase() === 'youtube';
    setBrowserButtonState(genericBrowserVideo, stateValue || !supportsBrowserDownloads || !hasVideo);
    setBrowserButtonState(genericBrowserAudio, stateValue || !supportsBrowserDownloads || !hasAudio);
}

    function setBrowserButtonState(button, disabled) {
        if (!button) return;
        button.classList.toggle('disabled', disabled);
        if (disabled) {
            button.setAttribute('aria-disabled', 'true');
        } else {
            button.removeAttribute('aria-disabled');
        }
    }

    async function copyCaptionToClipboard(targetCaption = videoCaption, bubbleElement = captionBubble) {
        const text = targetCaption?.textContent?.trim();
        if (!text) {
            const unavailable = tr('legendUnavailable');
            showFeedback(unavailable, true);
            showToast(unavailable, true);
            return;
        }

        const context = targetCaption === videoCaption ? 'shopee' : 'generic';
        const pushCopiedEvent = async () => {
            const linkHash = await safeHash(state.media.video?.url || state.media.audio?.url || '');
            const payload = {};
            if (linkHash) {
                payload.link_hash = linkHash;
            }
            if (context !== 'shopee') {
                payload.context = context;
            }
            dl('caption_copied', payload);
        };

        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                showFeedback(tr('legendCopiedFeedback'));
                showCaptionBubble(bubbleElement);
                showToast(tr('legendCopiedToast'));
                await pushCopiedEvent();
            } catch (_) {
                fallbackCopy(text, bubbleElement);
                await pushCopiedEvent();
            }
        } else {
            fallbackCopy(text, bubbleElement);
            await pushCopiedEvent();
        }
    }

    function fallbackCopy(text, bubbleElement = captionBubble) {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'absolute';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showFeedback(tr('legendCopiedFeedback'));
            showCaptionBubble(bubbleElement);
            showToast(tr('legendCopiedToast'));
        } catch (error) {
            console.error(error);
            const fail = tr('legendCopyFailed');
            showFeedback(fail, true);
            showToast(fail, true);
        }
    }

    function copyPixKey(value) {
        copyTextValue(value, tr('pixCopyFeedback'), tr('pixCopyToast'), tr('pixCopyFailed'));
    }

    function copyPixPayload(value) {
        copyTextValue(value, tr('pixPayloadCopyFeedback'), tr('pixPayloadCopyToast'), tr('pixPayloadCopyFailed'));
    }

    function copyTextValue(value, feedbackMessage, toastMessage, failureMessage) {
        if (!value) {
            if (failureMessage) {
                showFeedback(failureMessage, true);
                showToast(failureMessage, true);
            }
            return;
        }

        const onSuccess = () => {
            if (feedbackMessage) {
                showFeedback(feedbackMessage);
            }
            if (toastMessage) {
                showToast(toastMessage);
            }
        };

        const onFailure = () => {
            if (!failureMessage) return;
            showFeedback(failureMessage, true);
            showToast(failureMessage, true);
        };

        if (navigator.clipboard?.writeText) {
            navigator.clipboard
                .writeText(value)
                .then(onSuccess)
                .catch(() => fallbackCopyText(value, onSuccess, onFailure));
        } else {
            fallbackCopyText(value, onSuccess, onFailure);
        }
    }

    function fallbackCopyText(value, onSuccess, onFailure) {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = value;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'absolute';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            onSuccess();
        } catch (error) {
            console.error(error);
            onFailure();
        }
    }

    function initDonationToast() {
        if (!donationToast || !donationModal) return;
        updateDonationToastTexts();
        donationToast.addEventListener('click', () => {
            openDonationModal(getDefaultDonationDataset());
            hideDonationToast(true);
        });
    }

    function updateDonationToastTexts(options = {}) {
        if (!donationToast) return;
        const downloadCount = typeof options.downloadCount === 'number' ? options.downloadCount : state.downloadCount;
        const useReminder = shouldShowDonationReminder(downloadCount);
        const titleKey = useReminder ? 'donationToastTitleReminder' : 'donationToastTitle';
        const subtitleKey = useReminder ? 'donationToastSubtitleReminder' : 'donationToastSubtitle';
        let title = tr(titleKey);
        let subtitle = tr(subtitleKey);
        if (useReminder && typeof downloadCount === 'number') {
            subtitle = subtitle.replace('{{count}}', String(downloadCount));
        }
        const aria = tr('donationToastAria');
        if (donationToastTitle) {
            donationToastTitle.textContent = title;
        }
        if (donationToastSubtitle) {
            donationToastSubtitle.textContent = subtitle;
        }
        if (aria && typeof donationToast.setAttribute === 'function') {
            donationToast.setAttribute('aria-label', aria);
            donationToast.setAttribute('title', aria);
        }
        updateDonationCountBadge(downloadCount);
    }

    function showDonationToast(downloadCount) {
        if (!donationToast || !donationModal) return;
        updateDonationToastTexts({ downloadCount });
        donationToast.classList.remove('hidden');
        requestAnimationFrame(() => donationToast.classList.add('show'));
        window.clearTimeout(donationToastTimer);
        window.clearTimeout(donationToastHideTimer);
        donationToastTimer = window.setTimeout(() => hideDonationToast(), 12000);
    }

    function hideDonationToast(immediate = false) {
        if (!donationToast) return;
        donationToast.classList.remove('show');
        window.clearTimeout(donationToastTimer);
        window.clearTimeout(donationToastHideTimer);
        if (immediate) {
            donationToast.classList.add('hidden');
            return;
        }
        donationToastHideTimer = window.setTimeout(() => {
            donationToast.classList.add('hidden');
        }, 300);
    }

    function getDefaultDonationDataset() {
        if (!donationBlocks || donationBlocks.length === 0) {
            return {};
        }
        const firstBlock = donationBlocks[0] || donationBlocks.item?.(0);
        return firstBlock ? { ...firstBlock.dataset } : {};
    }

    function shouldShowDonationReminder(downloadCount) {
        if (typeof downloadCount !== 'number') {
            return false;
        }
        return downloadCount >= DONATION_REMINDER_THRESHOLD;
    }

    function updateDonationCountBadge(downloadCount) {
        if (!donationToastCount) return;
        if (!Number.isFinite(downloadCount) || downloadCount <= 0) {
            donationToastCount.classList.add('hidden');
            donationToastCount.textContent = '';
            return;
        }
        const label = formatDownloadCountLabel(downloadCount);
        donationToastCount.textContent = label;
        donationToastCount.classList.remove('hidden');
    }

    function initDonationBlock(container) {
        if (!container) return;
        const openButton = container.querySelector('[data-pix-open]');
        if (!openButton) return;
        const dataset = { ...container.dataset };
        openButton.addEventListener('click', () => openDonationModal(dataset));
    }

    function openDonationModal(dataset = {}) {
        if (!donationModal) return;
        hideDonationToast(true);
        const {
            pixKey = '',
            pixName = 'SVDown',
            pixCity = 'ILHEUS',
            pixReference = 'SVDown'
        } = dataset;

        donationContext.key = pixKey;
        donationContext.normalizedKey = normalizePixKey(pixKey);
        donationContext.name = sanitizePixText(pixName, 'SVDown', 25);
        donationContext.city = sanitizePixText(pixCity, 'ILHEUS', 15);
        donationContext.reference = sanitizeReference(pixReference);
        donationContext.payload = '';
        donationContext.lastValidAmount = 0;

        if (donationModalFeedback) {
            donationModalFeedback.textContent = '';
            donationModalFeedback.classList.remove('error');
        }
        if (donationModalPayloadDisplay) {
            donationModalPayloadDisplay.textContent = tr('pixPayloadPlaceholder');
            donationModalPayloadDisplay.classList.add('empty');
            donationModalPayloadDisplay.setAttribute('aria-label', tr('pixPayloadPlaceholder'));
        }
        setPayloadBubbleDefault(false);
        if (donationModalQrWrapper) {
            donationModalQrWrapper.hidden = true;
        }
        if (donationModalQrImage) {
            donationModalQrImage.removeAttribute('src');
        }

        const defaultAmount = donationContext.defaultAmount || '';
        donationContext.rawAmountInput = defaultAmount;
        if (donationModalAmountInput) {
            donationModalAmountInput.value = defaultAmount;
        }
        updateDonationPayload(defaultAmount);

        lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        donationModal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        requestAnimationFrame(() => {
            donationModalAmountInput?.focus();
            donationModalAmountInput?.select();
        });
    }

    function closeDonationModal() {
        if (!donationModal) return;
        donationModal.classList.add('hidden');
        document.body.classList.remove('modal-open');
        if (donationModalQrImage) {
            donationModalQrImage.removeAttribute('src');
        }
        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
            try {
                lastFocusedElement.focus();
            } catch (_) {
                // ignore focus errors
            }
        }
        setPayloadBubbleDefault(false);
        lastFocusedElement = null;
    }

    function handleDonationAmountInput() {
        if (!donationModalAmountInput) return;
        updateDonationPayload(donationModalAmountInput.value, { formatInput: false });
    }

    function selectQuickAmount(button) {
        if (!button || !donationModalAmountInput) return;
        const rawValue = Number(button.getAttribute('data-pix-quick'));
        if (!Number.isFinite(rawValue) || rawValue <= 0) return;
        const formatted = formatPixAmountForInput(rawValue);
        donationModalAmountInput.value = formatted;
        updateDonationPayload(formatted);
        donationModalAmountInput.focus();
        donationModalAmountInput.select();
    }

    function handlePayloadCopy() {
        if (!donationContext.payload) {
            const fail = tr('pixPayloadUnavailable');
            showFeedback(fail, true);
            showToast(fail, true);
            return;
        }
        copyPixPayload(donationContext.payload);
        if (donationModalPayloadBubble) {
            showCaptionBubble(donationModalPayloadBubble);
        }
    }

    function updateDonationPayload(rawValue, options = {}) {
        if (!donationModal) return;
        const parsed = parsePixAmount(rawValue);
        if (parsed.error) {
            donationContext.payload = '';
            donationContext.lastValidAmount = 0;
            if (donationModalFeedback) {
                donationModalFeedback.textContent = parsed.error;
                donationModalFeedback.classList.add('error');
            }
            if (donationModalPayloadDisplay) {
                donationModalPayloadDisplay.textContent = tr('pixPayloadPlaceholder');
                donationModalPayloadDisplay.classList.add('empty');
                donationModalPayloadDisplay.setAttribute('aria-label', tr('pixPayloadPlaceholder'));
            }
            if (donationModalQrWrapper) {
                donationModalQrWrapper.hidden = true;
            }
            if (donationModalQrImage) {
                donationModalQrImage.removeAttribute('src');
            }
            setPayloadBubbleDefault(false);
            return;
        }

        if (parsed.hasInput) {
            donationContext.rawAmountInput = parsed.formatted;
            if (donationModalAmountInput && options.formatInput !== false) {
                donationModalAmountInput.value = parsed.formatted;
            }
        } else {
            donationContext.rawAmountInput = '';
        }

        const amountValue = parsed.amount;
        donationContext.lastValidAmount = amountValue;

        let payload = '';
        try {
            payload = buildPixPayload({
                key: donationContext.normalizedKey,
                name: donationContext.name,
                city: donationContext.city,
                reference: donationContext.reference,
                amount: amountValue
            });
        } catch (error) {
            console.error('SVDown: erro ao montar payload PIX', error);
        }

        donationContext.payload = payload;
        if (!payload) {
            if (donationModalFeedback) {
                donationModalFeedback.textContent = tr('pixPayloadUnavailable');
                donationModalFeedback.classList.add('error');
            }
            if (donationModalPayloadDisplay) {
                donationModalPayloadDisplay.textContent = tr('pixPayloadPlaceholder');
                donationModalPayloadDisplay.classList.add('empty');
                donationModalPayloadDisplay.setAttribute('aria-label', tr('pixPayloadPlaceholder'));
            }
            if (donationModalQrWrapper) {
                donationModalQrWrapper.hidden = true;
            }
            if (donationModalQrImage) {
                donationModalQrImage.removeAttribute('src');
            }
            setPayloadBubbleDefault(false);
            return;
        }

        if (donationModalPayloadDisplay) {
            donationModalPayloadDisplay.textContent = payload;
            donationModalPayloadDisplay.classList.remove('empty');
            donationModalPayloadDisplay.setAttribute('aria-label', getModalCopyHint());
            donationModalPayloadDisplay.scrollTop = 0;
        }

        if (donationModalFeedback) {
            const message = amountValue > 0
                ? tr('pixAmountReady').replace('{{value}}', formatCurrencyValue(amountValue))
                : tr('pixAmountReadyNoValue');
            donationModalFeedback.textContent = message;
            donationModalFeedback.classList.remove('error');
        }

        if (donationModalQrWrapper && donationModalQrImage && payload) {
            try {
                donationModalQrImage.onerror = () => {
                    const fail = tr('pixPayloadUnavailable');
                    showFeedback(fail, true);
                    showToast(fail, true);
                    donationModalQrWrapper.hidden = true;
                };
                renderPixQr(donationModalQrImage, payload);
                donationModalQrWrapper.hidden = false;
            } catch (error) {
                console.error('SVDown: erro ao renderizar QR PIX', error);
                donationModalQrWrapper.hidden = true;
            }
        }

        setPayloadBubbleDefault(true);
    }

    function parsePixAmount(rawValue) {
        const value = (rawValue ?? '').toString().trim();
        if (!value) {
            return {
                amount: 0,
                formatted: '',
                hasInput: false,
                error: ''
            };
        }

        let normalized = value;
        if (lang === 'pt') {
            normalized = normalized.replace(/\./g, '').replace(',', '.');
        } else {
            normalized = normalized.replace(/,/g, '');
        }
        normalized = normalized.replace(/[^\d.]/g, '');

        if (!normalized) {
            return {
                amount: 0,
                formatted: value,
                hasInput: true,
                error: tr('pixAmountInvalid')
            };
        }

        const amount = Number(normalized);
        if (!Number.isFinite(amount) || amount <= 0) {
            return {
                amount: 0,
                formatted: value,
                hasInput: true,
                error: tr('pixAmountInvalid')
            };
        }

        const rounded = Math.round(amount * 100) / 100;
        return {
            amount: rounded,
            formatted: formatPixAmountForInput(rounded),
            hasInput: true,
            error: ''
        };
    }

    function formatPixAmountForInput(amount) {
        if (!Number.isFinite(amount)) return '';
        const locale = lang === 'en' ? 'en-US' : 'pt-BR';
        return new Intl.NumberFormat(locale, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })
            .format(amount)
            .replace(/\u00a0/g, ' ');
    }

    function formatCurrencyValue(amount) {
        if (!Number.isFinite(amount)) return '';
        const locale = lang === 'en' ? 'en-US' : 'pt-BR';
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    function getModalCopyHint() {
        return lang === 'en' ? 'Tap to copy' : 'Toque para copiar';
    }

    function setPayloadBubbleDefault(showBubble = false) {
        if (!donationModalPayloadBubble) return;
        resetCaptionBubble(donationModalPayloadBubble);
        if (showBubble) {
            donationModalPayloadBubble.classList.add('show');
        }
    }

    function handleDonationModalKeydown(event) {
        if (!donationModal || donationModal.classList.contains('hidden')) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            closeDonationModal();
            return;
        }
        if (event.key === 'Tab') {
            trapFocus(event);
        }
    }

    function trapFocus(event) {
        if (!donationModalDialog) return;
        const focusableSelectors = [
            'a[href]',
            'button:not([disabled])',
            'textarea:not([disabled])',
            'input:not([type="hidden"]):not([disabled])',
            'select:not([disabled])',
            '[tabindex]:not([tabindex="-1"])'
        ];
        const focusable = Array.from(
            donationModalDialog.querySelectorAll(focusableSelectors.join(','))
        ).filter(el => el.offsetParent !== null);
        if (!focusable.length) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];
        const isShift = event.shiftKey;
        const active = document.activeElement;

        if (!isShift && active === lastElement) {
            event.preventDefault();
            firstElement.focus();
        } else if (isShift && active === firstElement) {
            event.preventDefault();
            lastElement.focus();
        }
    }

    function normalizePixKey(value) {
        if (!value) return '';
        const trimmed = value.trim();
        if (!trimmed) return '';
        const noSpaces = trimmed.replace(/\s+/g, '');
        if (noSpaces.includes('@')) return noSpaces;
        if (/^[0-9a-fA-F-]{36}$/.test(noSpaces)) return noSpaces.toLowerCase();
        if (noSpaces.startsWith('+')) {
            const digits = noSpaces.slice(1).replace(/\D/g, '');
            return digits ? `+${digits}` : '';
        }
        const onlyDigits = noSpaces.replace(/\D/g, '');
        return onlyDigits || noSpaces;
    }

    function sanitizePixText(value, fallback, maxLength) {
        const fallbackValue = (fallback || '').toString().trim() || 'SVDOWN';
        const base = (value || '').toString().trim() || fallbackValue;
        const normalized = base
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^0-9A-Za-z ]/g, ' ')
            .toUpperCase()
            .replace(/\s+/g, ' ')
            .trim();
        const candidate = normalized || fallbackValue.toUpperCase();
        return candidate.slice(0, maxLength);
    }

    function sanitizeReference(value) {
        const fallback = 'SVDown';
        const base = (value || fallback).toString().trim() || fallback;
        const sanitized = base
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^0-9A-Za-z]/g, '')
            .toUpperCase();
        return sanitized.slice(0, 25) || fallback.toUpperCase();
    }

    function buildPixPayload({ key, name, city, reference, amount }) {
        if (!key) return '';
        const gui = emv('00', 'BR.GOV.BCB.PIX');
        const keyField = emv('01', key);
        const descField = reference ? emv('02', reference) : '';
        const merchantAccountInfo = emv('26', `${gui}${keyField}${descField}`);
        const merchantCategory = emv('52', '0000');
        const currency = emv('53', '986');
        const amountField = Number.isFinite(amount) && amount > 0 ? emv('54', formatAmountForPayload(amount)) : '';
        const countryCode = emv('58', 'BR');
        const nameField = emv('59', name || 'SVDOWN');
        const cityField = emv('60', city || 'ILHEUS');
        const additionalData = reference ? emv('62', emv('05', reference)) : '';
        const initial = `${emv('00', '01')}${emv('01', '11')}${merchantAccountInfo}${merchantCategory}${currency}${amountField}${countryCode}${nameField}${cityField}${additionalData}6304`;
        const crc = computeCRC(initial);
        return `${initial}${crc}`;
    }

    function emv(id, value) {
        const stringValue = value?.toString() ?? '';
        const length = stringValue.length.toString().padStart(2, '0');
        return `${id}${length}${stringValue}`;
    }

    function formatAmountForPayload(amount) {
        const rounded = Math.round(Number(amount) * 100) / 100;
        return rounded.toFixed(2);
    }

    function computeCRC(payload) {
        const polynomial = 0x1021;
        let crc = 0xffff;
        for (let i = 0; i < payload.length; i += 1) {
            crc ^= payload.charCodeAt(i) << 8;
            for (let j = 0; j < 8; j += 1) {
                if ((crc & 0x8000) !== 0) {
                    crc = ((crc << 1) ^ polynomial) & 0xffff;
                } else {
                    crc = (crc << 1) & 0xffff;
                }
            }
        }
        return crc.toString(16).toUpperCase().padStart(4, '0');
    }

    function renderPixQr(image, payload) {
        const baseUrl = 'https://api.qrserver.com/v1/create-qr-code/';
        const size = 220;
        const url = `${baseUrl}?size=${size}x${size}&margin=0&data=${encodeURIComponent(payload)}&t=${Date.now()}`;
        image.decoding = 'async';
        image.referrerPolicy = 'no-referrer';
        image.src = url;
    }

    function formatNumber(value) {
        return typeof value === 'number' ? value.toLocaleString('pt-BR') : '0';
    }

    function updateUrlWithQuery(link) {
        if (!window.history || typeof window.history.replaceState !== 'function') return;
        const current = new URL(window.location.href);
        if (link) {
            current.searchParams.set('link', link);
        } else {
            current.searchParams.delete('link');
        }
        window.history.replaceState({}, '', current.toString());
    }

    function tryResolveFromQuery() {
        const current = new URL(window.location.href);
        const linkFromQuery = current.searchParams.get('link');
        if (!linkFromQuery) return;
        input.value = linkFromQuery;
        handleResolve(linkFromQuery);
    }

    function resetCaptionBubble(bubbleElement = captionBubble) {
        if (!bubbleElement) return;
        const existingTimer = captionBubbleTimers.get(bubbleElement);
        if (existingTimer) {
            clearTimeout(existingTimer);
            captionBubbleTimers.delete(bubbleElement);
        }
        bubbleElement.classList.remove('show');
        bubbleElement.textContent = bubbleElement.hasAttribute('data-pix-payload-bubble')
            ? getModalCopyHint()
            : tr('clickToCopy');
    }

    function showCaptionBubble(bubbleElement = captionBubble) {
        if (!bubbleElement) return;
        bubbleElement.textContent = tr('copied');
        bubbleElement.classList.add('show');
        const existingTimer = captionBubbleTimers.get(bubbleElement);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        const timer = setTimeout(() => {
            captionBubbleTimers.delete(bubbleElement);
            if (bubbleElement.hasAttribute('data-pix-payload-bubble')) {
                setPayloadBubbleDefault(true);
                return;
            }
            bubbleElement.classList.remove('show');
            bubbleElement.textContent = tr('clickToCopy');
        }, 1400);
        captionBubbleTimers.set(bubbleElement, timer);
    }

    function showToast(message, isError = false) {
        if (!toast) return;
        toast.textContent = message;
        toast.classList.toggle('error', isError);
        toast.classList.remove('hidden');
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.classList.add('hidden'), 250);
        }, 2200);
    }

    function showMetadataCleanToast(message = tr('metadataCleanSuccess')) {
        if (!metadataToast) return;
        if (metadataToastText) {
            metadataToastText.textContent = message;
        } else {
            metadataToast.textContent = message;
        }
        metadataToast.classList.remove('hidden');
        metadataToast.classList.add('show');
        clearTimeout(metadataToastTimer);
        metadataToastTimer = setTimeout(() => {
            metadataToast.classList.remove('show');
            setTimeout(() => metadataToast.classList.add('hidden'), 250);
        }, 8000);
    }

    async function safeHash(value) {
        if (!value) return '';
        try {
            return await sha256Hex(value);
        } catch (_) {
            return '';
        }
    }

    function triggerBrowserDownload(objectUrl, fileName, mediaType) {
        const anchor = document.createElement('a');
        const fallbackName = fileName || buildFallbackFileName('', mediaType);
        anchor.href = objectUrl;
        anchor.download = fallbackName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    }

    function extractFileNameFromContentDisposition(headerValue) {
        if (!headerValue) return '';

        const filenameStarMatch = headerValue.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i);
        if (filenameStarMatch && filenameStarMatch[1]) {
            const candidate = decodeAndSanitizeFileName(filenameStarMatch[1]);
            if (candidate) return candidate;
        }

        const filenameMatch = headerValue.match(/filename\s*=\s*\"?([^\";]+)\"?/i);
        if (filenameMatch && filenameMatch[1]) {
            const candidate = decodeAndSanitizeFileName(filenameMatch[1]);
            if (candidate) return candidate;
        }

        return '';
    }

    function buildFallbackFileName(originalName, mediaType) {
        const extension = mediaType === 'audio' ? '.mp3' : '.mp4';
        const sanitizedOriginal = sanitizeFileName(originalName || '');
        if (sanitizedOriginal) {
            return ensureExtension(sanitizedOriginal, extension);
        }
        const now = new Date();
        const pad = value => value.toString().padStart(2, '0');
        const timestamp = [
            now.getUTCFullYear(),
            pad(now.getUTCMonth() + 1),
            pad(now.getUTCDate()),
            pad(now.getUTCHours()),
            pad(now.getUTCMinutes()),
            pad(now.getUTCSeconds())
        ].join('');
        return `SVDown-${timestamp}${extension}`;
    }

    function decodeAndSanitizeFileName(rawValue) {
        if (!rawValue) return '';
        const trimmed = rawValue.trim().replace(/^\"|\"$/g, '');
        if (!trimmed) return '';
        let decoded = trimmed;
        try {
            decoded = decodeURIComponent(trimmed);
        } catch (_) {
            decoded = trimmed;
        }
        return sanitizeFileName(decoded);
    }

    function sanitizeFileName(value) {
        if (!value) return '';
        return value
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
            .replace(/\s{2,}/g, ' ')
            .replace(/\.\.+/g, '.')
            .replace(/^[-.]+|[-.]+$/g, '')
            .trim();
    }

    function ensureExtension(name, extension) {
        if (!extension) return name;
        const normalizedExt = extension.startsWith('.') ? extension : `.${extension}`;
        if (!name) return `download${normalizedExt}`;
        if (name.toLowerCase().endsWith(normalizedExt.toLowerCase())) {
            return name;
        }
        return `${name}${normalizedExt}`;
    }
}

function setButtonLabel(button, labelText) {
    if (!button || !labelText) return;
    let label = button.querySelector('.btn-label');
    if (!label) {
        label = document.createElement('span');
        label.className = 'btn-label';
        button.append(label);
    }
    label.textContent = labelText;
}

function initDownloadButton(button, defaultLabel, loadingLabel) {
    if (!button) return null;
    let spinner = button.querySelector('.btn-spinner');
    if (!spinner) {
        spinner = document.createElement('span');
        spinner.className = 'btn-spinner hidden';
        spinner.setAttribute('aria-hidden', 'true');
        button.prepend(spinner);
    }
    let label = button.querySelector('.btn-label');
    if (!label) {
        label = document.createElement('span');
        label.className = 'btn-label';
        label.textContent = defaultLabel;
        button.append(label);
    }

    const setDisabled = (state) => {
        button.classList.toggle('disabled', state);
        button.setAttribute('aria-disabled', String(state));
    };

    const setLoading = (state, overrideLabel) => {
        spinner?.classList.toggle('hidden', !state);
        if (label) {
            label.textContent = state ? (overrideLabel || loadingLabel) : defaultLabel;
        }
        setDisabled(state);
    };

    return {
        element: button,
        setLoading,
        setDisabled,
        reset: () => setLoading(false),
    };
}

function readStoredDownloadCount() {
    const rawValue = safeStorageGet(DOWNLOAD_COUNT_STORAGE_KEY);
    const parsed = Number.parseInt(rawValue ?? '', 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function persistDownloadCount(value) {
    safeStorageSet(DOWNLOAD_COUNT_STORAGE_KEY, String(Math.max(0, value)));
}

function safeStorageGet(key) {
    try {
        return window.localStorage?.getItem?.(key) ?? null;
    } catch (_) {
        return null;
    }
}

function safeStorageSet(key, value) {
    try {
        window.localStorage?.setItem?.(key, value);
    } catch (_) {
        // ignore storage failures (private mode, etc.)
    }
}

function ensureUserId() {
    let stored = safeStorageGet(USER_ID_STORAGE_KEY);
    if (!isValidUserId(stored)) {
        stored = generateClientUuid();
        safeStorageSet(USER_ID_STORAGE_KEY, stored);
    }
    persistUserIdCookie(stored);
    if (state) {
        state.userId = stored;
    }
    return stored;
}

function persistUserIdCookie(userId) {
    if (!userId) return;
    try {
        const maxAgeSeconds = 60 * 60 * 24 * 365;
        const secureFlag = window.location.protocol === 'https:' ? ';Secure' : '';
        document.cookie = `${USER_ID_COOKIE_NAME}=${encodeURIComponent(userId)};path=/;max-age=${maxAgeSeconds};SameSite=Strict${secureFlag}`;
    } catch (error) {
        console.warn('SVDown: failed to persist user cookie', error);
    }
}

function generateClientUuid() {
    if (window.crypto?.randomUUID) {
        return window.crypto.randomUUID();
    }
    const array = new Uint32Array(4);
    if (window.crypto?.getRandomValues) {
        window.crypto.getRandomValues(array);
    } else {
        for (let i = 0; i < array.length; i += 1) {
            array[i] = Math.floor(Math.random() * 0xffffffff);
        }
    }
    const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
    let index = 0;
    return template.replace(/[xy]/g, char => {
        const bucketIndex = index >> 3;
        const shift = (index % 8) * 4;
        const bucket = array[bucketIndex] ?? 0;
        const value = (bucket >> shift) & 0xf;
        index += 1;
        const r = char === 'x' ? value : ((value & 0x3) | 0x8);
        return r.toString(16);
    });
}

function isValidUserId(value) {
    return typeof value === 'string' && /^[a-z0-9-]{16,}$/i.test(value);
}

function initUserStatsDashboard() {
    if (!statsSection) {
        return;
    }
    hydrateStatsCopy();
    setStatsStatus(tr('userStatsLoading'));
    updateStatsGrid();
    fetchUserStats().catch((error) => {
        console.warn('SVDown: failed to load stats', error);
        setStatsStatus(tr('userStatsError'));
    });
}

function hydrateStatsCopy() {
    if (!statsSection) return;
    setStatsTitle(tr('userStatsTitleCommunity'));
    setStatLabel('downloads', tr('userStatsDownloadsLabel'));
    setStatLabel('platform', tr('userStatsPlatformLabel'));
    setStatLabel('duration', tr('userStatsDurationLabel'));
    setStatHint('downloads', tr('userStatsLoading'));
    setStatHint('platform', tr('userStatsLoading'));
    setStatHint('duration', tr('userStatsLoading'));
    setStatValue('downloads', '—');
    setStatValue('platform', '—');
    setStatValue('duration', tr('userStatsDurationEmpty'));
}

async function fetchUserStats() {
    if (!statsSection) return;
    const userId = state.userId || ensureUserId();
    const query = userId ? `?uid=${encodeURIComponent(userId)}` : '';
    const response = await fetch(`/api/session/stats${query}`, {
        headers: {
            'Accept': 'application/json',
        },
    });
    if (!response.ok) {
        throw new Error(`Stats request failed: ${response.status}`);
    }
    const payload = await response.json();
    if (!payload?.stats) {
        throw new Error('Missing stats payload');
    }
    state.stats = normalizeStatsPayload(payload.stats);
    updateStatsGrid();
}

function normalizeStatsPayload(rawStats) {
    const normalizeServices = (services) => {
        if (!Array.isArray(services)) {
            return [];
        }
        const mapped = services
            .filter(entry => entry && typeof entry.service === 'string' && entry.service.trim().length > 0)
            .map(entry => ({
                service: entry.service,
                downloads: sanitizeNonNegativeNumber(entry.downloads),
                totalDurationSeconds: sanitizeDuration(entry.totalDurationSeconds),
            }));
        return sortServiceSummaries(mapped);
    };

    return {
        user: {
            downloads: sanitizeNonNegativeNumber(rawStats?.user?.downloads),
            totalDurationSeconds: sanitizeDuration(rawStats?.user?.totalDurationSeconds),
            services: normalizeServices(rawStats?.user?.services),
        },
        global: {
            downloads: sanitizeNonNegativeNumber(rawStats?.global?.downloads),
            totalDurationSeconds: sanitizeDuration(rawStats?.global?.totalDurationSeconds),
            services: normalizeServices(rawStats?.global?.services),
        },
    };
}

function updateStatsGrid() {
    if (!statsSection) return;
    if (!state?.stats) {
        setStatsTitle(tr('userStatsTitleCommunity'));
        setStatsStatus(tr('userStatsLoading'));
        setStatValue('downloads', '—');
        setStatValue('platform', '—');
        setStatValue('duration', tr('userStatsDurationEmpty'));
        setStatHint('downloads', tr('userStatsLoading'));
        setStatHint('platform', tr('userStatsLoading'));
        setStatHint('duration', tr('userStatsLoading'));
        return;
    }
    const { user, global } = state.stats;
    const userDownloads = sanitizeNonNegativeNumber(user?.downloads);
    const globalDownloads = sanitizeNonNegativeNumber(global?.downloads);
    const hasUserDownloads = userDownloads > 0;
    const viewingUserStats = hasUserDownloads
        || sanitizeDuration(user?.totalDurationSeconds) > 0
        || (Array.isArray(user?.services) && user.services.length > 0 && sanitizeNonNegativeNumber(user.services[0]?.downloads) > 0);
    const downloadsValue = viewingUserStats ? userDownloads : globalDownloads;
    setStatsTitle(tr(viewingUserStats ? 'userStatsTitleOwn' : 'userStatsTitleCommunity'));
    setStatsStatus(tr(viewingUserStats ? 'userStatsStatusOwn' : 'userStatsStatusCommunity'));
    setStatValue('downloads', formatNumberValue(downloadsValue));
    setStatHint('downloads', tr(viewingUserStats ? 'userStatsDownloadsHintOwn' : 'userStatsDownloadsHintGlobal'));

    const userTop = Array.isArray(user?.services) && user.services.length > 0 ? user.services[0] : null;
    const globalTop = Array.isArray(global?.services) && global.services.length > 0 ? global.services[0] : null;
    const topSource = viewingUserStats && userTop ? 'user' : (globalTop ? 'global' : null);
    const topEntry = topSource === 'user' ? userTop : globalTop;
    if (topEntry && topEntry.service) {
        setStatValue('platform', resolveServiceName(topEntry.service));
        const hintKey = topSource === 'user' ? 'userStatsPlatformHintOwn' : 'userStatsPlatformHintGlobal';
        setStatHint('platform', formatMessage(hintKey, { count: formatNumberValue(topEntry.downloads) }));
    } else {
        setStatValue('platform', tr('userStatsPlatformEmpty'));
        const emptyHintKey = viewingUserStats ? 'userStatsPlatformHintWaiting' : 'userStatsPlatformHintGlobalEmpty';
        setStatHint('platform', tr(emptyHintKey));
    }

    const userDuration = sanitizeDuration(user?.totalDurationSeconds);
    const globalDuration = sanitizeDuration(global?.totalDurationSeconds);
    const durationValue = viewingUserStats ? userDuration : globalDuration;
    setStatValue('duration', formatDurationSummary(durationValue));
    setStatHint('duration', tr(viewingUserStats ? 'userStatsDurationHintOwn' : 'userStatsDurationHintGlobal'));
}

function setStatValue(key, value) {
    const target = statsValues?.[key];
    if (target) {
        target.textContent = value;
    }
}

function setStatHint(key, value) {
    const target = statsHints?.[key];
    if (target) {
        target.textContent = value;
    }
}

function setStatLabel(key, value) {
    const target = statsLabels?.[key];
    if (target) {
        target.textContent = value;
    }
}

function setStatsStatus(value) {
    if (statsStatus) {
        statsStatus.textContent = value || '';
    }
}

function setStatsTitle(value) {
    if (statsTitle) {
        statsTitle.textContent = value || '';
    }
}

function formatNumberValue(value) {
    const safeValue = sanitizeNonNegativeNumber(value);
    return numberFormatter.format(safeValue);
}

function formatDurationSummary(value) {
    const safeValue = sanitizeDuration(value);
    if (!Number.isFinite(safeValue) || safeValue <= 0) {
        return tr('userStatsDurationEmpty');
    }
    const totalSeconds = Math.round(safeValue);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const minuteLabel = lang === 'en' ? 'm' : 'min';
    const parts = [];
    if (hours > 0) {
        parts.push(`${hours}h`);
    }
    if (minutes > 0) {
        parts.push(`${minutes}${minuteLabel}`);
    }
    if (hours === 0 && minutes === 0) {
        parts.push(`${seconds}s`);
    }
    if (parts.length === 0) {
        parts.push('0s');
    }
    return parts.join(' ');
}

function resolveServiceName(service) {
    if (!service) {
        return tr('userStatsPlatformEmpty');
    }
    const normalized = service.toLowerCase();
    const label = serviceDisplayNames?.[normalized];
    if (label) {
        if (typeof label === 'string') {
            return label;
        }
        return label[lang === 'en' ? 'en' : 'pt'] || label.pt || label.en || service;
    }
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function sortServiceSummaries(entries) {
    const list = Array.isArray(entries) ? entries.slice() : [];
    return list.sort((a, b) => {
        const downloadsA = sanitizeNonNegativeNumber(a?.downloads);
        const downloadsB = sanitizeNonNegativeNumber(b?.downloads);
        if (downloadsB !== downloadsA) {
            return downloadsB - downloadsA;
        }
        const durationA = sanitizeDuration(a?.totalDurationSeconds);
        const durationB = sanitizeDuration(b?.totalDurationSeconds);
        if (durationB !== durationA) {
            return durationB - durationA;
        }
        const serviceA = (a?.service || '').toString();
        const serviceB = (b?.service || '').toString();
        return serviceA.localeCompare(serviceB);
    });
}

function sanitizeNonNegativeNumber(value) {
    const num = typeof value === 'number' ? value : Number.parseFloat(value);
    if (!Number.isFinite(num) || num < 0) {
        return 0;
    }
    return Math.floor(num);
}

function sanitizeDuration(value) {
    const num = typeof value === 'number' ? value : Number.parseFloat(value);
    if (!Number.isFinite(num) || num < 0) {
        return 0;
    }
    return num;
}

function updateLocalStatsAfterDownload(mediaType) {
    if (!state?.stats?.user) {
        return;
    }
    const durationSeconds = getDurationSecondsForMedia(mediaType);
    if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
        state.stats.user.totalDurationSeconds = sanitizeDuration(state.stats.user.totalDurationSeconds) + durationSeconds;
    }
    const service = (state.media?.service || '').toLowerCase();
    if (service) {
        state.stats.user.services = Array.isArray(state.stats.user.services) ? state.stats.user.services : [];
        const existing = state.stats.user.services.find(entry => entry.service === service);
        if (existing) {
            existing.downloads = sanitizeNonNegativeNumber(existing.downloads) + 1;
            if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
                existing.totalDurationSeconds = sanitizeDuration(existing.totalDurationSeconds) + durationSeconds;
            }
        } else {
            state.stats.user.services.push({
                service,
                downloads: 1,
                totalDurationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0,
            });
        }
        state.stats.user.services = sortServiceSummaries(state.stats.user.services);
    }
    updateStatsGrid();
}


// Function to extract the first URL from text
function extractUrl(text) {
  if (!text) {
    return null;
  }
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const foundUrls = text.match(urlRegex);

  if (foundUrls) {
    return foundUrls[0]; // Return the first URL found
  }
  return null;
}

/*
// Example usage (uncomment to test):
const text1 = "Confira este clipe: https://www.mercadolivre.com.br/clips/?shortsparams=true&type=short&short_id=vJ2OIh&origin=share&st=340002220&matt_tool=73180307#origin=share e veja mais.";
const text2 = "Este é um texto sem link do Mercado Livre.";
const text3 = "Outro link aqui: https://www.youtube.com/watch?v=dQw4w9WgXcQ mas o do ML é https://www.mercadolivre.com.br/clips/?short_id=abc";
const text4 = "Apenas um texto com https://www.mercadolivre.com.br/clips/qualquercoisa";
const text5 = "Aqui está o ID do clipe: vJ2OIh";
const text6 = "Um texto com o link incompleto: mercadolivre.com.br/clips/?short_id=xyz";


console.log('Exemplo 1:', extractMercadoLivreClipLink(text1));
console.log('Exemplo 2:', extractMercadoLivreClipLink(text2));
console.log('Exemplo 3:', extractMercadoLivreClipLink(text3));
console.log('Exemplo 4:', extractMercadoLivreClipLink(text4));
console.log('Exemplo 5:', extractMercadoLivreClipLink(text5));
console.log('Exemplo 6:', extractMercadoLivreClipLink(text6));
*/