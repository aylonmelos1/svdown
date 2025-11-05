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
const feedback = document.getElementById('feedback');
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
const shareLink = document.getElementById('share-link');
const loader = document.getElementById('loading-indicator');
const loaderText = document.getElementById('loading-text');
const resolveButton = document.getElementById('resolve-button');
const toast = document.getElementById('toast');
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
let toastTimer;
const captionBubbleTimers = new WeakMap();
let lastFocusedElement = null;

const state = {
    media: {
        service: null,
        video: null,
        audio: null,
        shareUrl: null,
        pageProps: null,
        title: null,
        description: null,
    },
    linkHash: '',
    resolveStartTime: 0,
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
        audioConvertFailed: 'Não foi possível converter o áudio para MP3.',
        downloadComplete: 'Download concluído! Confira sua pasta de downloads.',
        downloadFailed: 'Não foi possível baixar o arquivo.',
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
        pixAmountInvalid: 'Valor inválido. Use números e até duas casas decimais.',
        pixAmountReady: 'Código atualizado para {{value}}.',
        pixAmountReadyNoValue: 'Código gerado sem valor definido. Você pode informar no app do banco.',
        processing: 'Processando...',
        unknownCreator: 'Criador desconhecido',
        noDescription: 'Sem descrição definida.'
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
        audioConvertFailed: 'Could not convert the audio to MP3.',
        downloadComplete: 'Download complete! Check your downloads folder.',
        downloadFailed: 'Could not download the file.',
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
        pixAmountInvalid: 'Invalid amount. Use numbers with up to two decimal places.',
        pixAmountReady: 'PIX code updated for {{value}}.',
        pixAmountReadyNoValue: 'PIX code generated without a predefined amount. You can set it in your banking app.',
        processing: 'Processing...',
        unknownCreator: 'Unknown creator',
        noDescription: 'No caption available.'
    }
};

donationContext.defaultAmount = lang === 'en' ? '10.00' : '10,00';

const tr = (key) => {
    const table = translations[lang] || translations.pt;
    return table[key] ?? translations.pt[key] ?? key;
};

if (!resolverSection || !input || !resolveButton || !resultSection || !videoElement || !videoCaption || !downloadLink) {
    console.warn('SVDown: elementos essenciais não encontrados, script abortado.');
} else {
    const downloadButtonCtrl = initDownloadButton(downloadLink, tr('downloadVideo'), tr('downloading'));
    const genericVideoButtonCtrl = initDownloadButton(genericDownloadVideo, tr('downloadVideo'), tr('downloading'));
    const genericAudioButtonCtrl = initDownloadButton(genericDownloadAudio, tr('downloadAudio'), tr('preparingMp3'));

    resolveButton.addEventListener('click', () => handleResolve(input.value.trim()));
    downloadLink.addEventListener('click', (event) => handleDownload(event, 'video', downloadButtonCtrl));
    genericDownloadVideo?.addEventListener('click', (event) => handleDownload(event, 'video', genericVideoButtonCtrl));
    genericDownloadAudio?.addEventListener('click', (event) => handleDownload(event, 'audio', genericAudioButtonCtrl));

    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            resolveButton.click();
        }
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

    async function handleResolve(link) {
        if (!link) {
            showFeedback(tr('enterLink'), true);
            return;
        }

        state.resolveStartTime = performance.now();
        state.linkHash = '';
        let domain = '';
        let hasQuery = false;
        try {
            state.linkHash = await sha256Hex(link);
            const u = new URL(link);
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
                body: JSON.stringify({ link }),
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
            updateUrlWithQuery(link);

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
        };

        if (data?.service === 'shopee') {
            renderShopeeResult(data);
        } else {
            renderGenericResult(data);
        }

        resultSection.classList.remove('hidden');
    }

    function renderShopeeResult(data) {
        genericCard?.classList.add('hidden');
        shopeeCard?.classList.remove('hidden');

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
        } else {
            if (!descriptionText && titleText) {
                descriptionText = titleText;
            }
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

        if (genericDownloadVideo) {
            const hasVideo = Boolean(videoSelection?.url);
            genericDownloadVideo.classList.toggle('hidden', !hasVideo);
            if (hasVideo) {
                genericVideoButtonCtrl?.reset();
            }
        }

        if (genericDownloadAudio) {
            const hasAudio = Boolean(audioSelection?.url);
            genericDownloadAudio.classList.toggle('hidden', !hasAudio);
            if (hasAudio) {
                genericAudioButtonCtrl?.reset();
            }
        }

        shareLink?.classList.add('hidden');
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
            }
            const audioHeader = response.headers.get('X-Audio-Transcoded');
            if (audioHeader === 'false') {
                showToast(tr('audioConvertFailed'), true);
            }

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const contentDisposition = response.headers.get('Content-Disposition');
            const serverFileName = extractFileNameFromContentDisposition(contentDisposition);
            const downloadName = serverFileName || buildFallbackFileName(selection.fileName, mediaType);
            triggerBrowserDownload(objectUrl, downloadName, mediaType);
            const downloadSuccess = tr('downloadComplete');
            showFeedback(downloadSuccess);
            showToast(downloadSuccess);

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

    function buildDownloadRequest(selection, mediaType) {
        const params = new URLSearchParams();
        params.set('url', selection.url);
        if (Array.isArray(selection.fallbackUrls)) {
            selection.fallbackUrls.filter(Boolean).forEach(url => params.append('fallback', url));
        }
        if (mediaType === 'audio') {
            params.set('type', 'audio');
        }
        return `/api/download?${params.toString()}`;
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
        if (!feedback) return;
        feedback.textContent = message;
        feedback.classList.toggle('error', isError);
        feedback.classList.remove('hidden');
    }

    function setLoading(stateValue, message = tr('processing')) {
        if (message && loaderText) loaderText.textContent = message;
        loader?.classList.toggle('hidden', !stateValue);
        resolveButton.disabled = stateValue;
        input.disabled = stateValue;

        const hasVideo = Boolean(state.media.video?.url);
        const hasAudio = Boolean(state.media.audio?.url);

        downloadButtonCtrl?.setDisabled(stateValue || state.media.service !== 'shopee' || !hasVideo);
        genericVideoButtonCtrl?.setDisabled(stateValue || state.media.service === 'shopee' || !hasVideo);
        genericAudioButtonCtrl?.setDisabled(stateValue || !hasAudio);
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

    function initDonationBlock(container) {
        if (!container) return;
        const openButton = container.querySelector('[data-pix-open]');
        if (!openButton) return;
        const dataset = { ...container.dataset };
        openButton.addEventListener('click', () => openDonationModal(dataset));
    }

    function openDonationModal(dataset = {}) {
        if (!donationModal) return;
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
