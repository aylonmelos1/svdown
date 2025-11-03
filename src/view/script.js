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
const genericDescription = document.getElementById('generic-description');
const likeCount = document.getElementById('like-count');
const commentCount = document.getElementById('comment-count');
const downloadLink = document.getElementById('download-link');
const genericDownloadVideo = document.getElementById('generic-download-video');
const genericDownloadAudio = document.getElementById('generic-download-audio');
const shareLink = document.getElementById('share-link');
const loader = document.getElementById('loading-indicator');
const loaderText = document.getElementById('loading-text');
const resolveButton = document.getElementById('resolve-button');
const captionBubble = document.getElementById('caption-hint');
const toast = document.getElementById('toast');
const copyPixButton = document.getElementById('copy-pix');
const newDownloadButton = document.getElementById('new-download');
const genericNewDownload = document.getElementById('generic-new-download');
let toastTimer;
let captionBubbleTimer;

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

if (!resolverSection || !input || !resolveButton || !resultSection || !videoElement || !videoCaption || !downloadLink) {
    console.warn('SVDown: elementos essenciais não encontrados, script abortado.');
} else {
    const downloadButtonCtrl = initDownloadButton(downloadLink, 'Baixar vídeo', 'Baixando...');
    const genericVideoButtonCtrl = initDownloadButton(genericDownloadVideo, 'Baixar vídeo', 'Baixando...');
    const genericAudioButtonCtrl = initDownloadButton(genericDownloadAudio, 'Baixar áudio (MP3)', 'Preparando MP3...');

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

    videoCaption.addEventListener('click', copyCaptionToClipboard);
    videoCaption.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            copyCaptionToClipboard();
        }
    });

    copyPixButton?.addEventListener('click', () => copyPixKey('5573991060975'));
    newDownloadButton?.addEventListener('click', resetForm);
    genericNewDownload?.addEventListener('click', resetForm);

    tryResolveFromQuery();

    async function handleResolve(link) {
        if (!link) {
            showFeedback('Informe um link.', true);
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

        setLoading(true, 'Resolvendo link...');
        showFeedback('Resolvendo link...');

        try {
            const response = await fetch('/api/resolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ link }),
            });

            const data = await response.json();
            if (!response.ok) {
                const responseTimeMs = Math.round(performance.now() - state.resolveStartTime);
                dl('resolve_error', {
                    link_hash: state.linkHash,
                    error_message: (data && data.error) || 'Não foi possível resolver o link.',
                    response_time_ms: responseTimeMs
                });
                throw new Error(data?.error || 'Não foi possível resolver o link.');
            }

            renderServiceResult(data);
            showFeedback('Link resolvido com sucesso!');
            updateUrlWithQuery(link);

            const responseTimeMs = Math.round(performance.now() - state.resolveStartTime);
            dl('resolve_success', {
                link_hash: state.linkHash,
                response_time_ms: responseTimeMs,
                service: data?.service || 'unknown',
            });

        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : 'Erro ao resolver link.';
            showFeedback(message, true);
            showToast('Não foi possível resolver o link.', true);
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

        resolverSection.classList.add('hidden');
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

        creatorName.textContent = mediaInfo?.userInfo?.videoUserName || data?.title || 'Criador desconhecido';
        videoCaption.textContent = mediaInfo?.video?.caption || 'Sem descrição definida.';

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

        if (captionBubble) {
            captionBubble.classList.remove('hidden');
            captionBubble.classList.remove('show');
            captionBubble.textContent = 'Clique para copiar';
        }
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

        if (genericTitle) {
            genericTitle.textContent = data?.title || 'Mídia encontrada';
        }

        if (genericDescription) {
            const descriptionText = data?.description || '';
            genericDescription.textContent = descriptionText;
            genericDescription.classList.toggle('hidden', !descriptionText);
        }

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
            showFeedback('Nenhum arquivo disponível para download.', true);
            showToast('Nenhum arquivo disponível para download.', true);
            return;
        }

        const loadingMessage = mediaType === 'audio' ? 'Preparando áudio...' : 'Preparando download...';
        setLoading(true, loadingMessage);
        buttonCtrl.setLoading(true, mediaType === 'audio' ? 'Preparando MP3...' : undefined);

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
                if (selectionHash) {
                    dl('download_error', {
                        link_hash: selectionHash,
                        error_message: 'Falha ao iniciar download.',
                        media_type: mediaType,
                        service: state.media.service || 'unknown',
                    });
                }
                throw new Error('Falha ao iniciar download.');
            }

            const metadataHeader = response.headers.get('X-Metadata-Cleaned');
            if (metadataHeader === 'false') {
                showToast('Não foi possível remover os metadados do vídeo.', true);
            }
            const audioHeader = response.headers.get('X-Audio-Transcoded');
            if (audioHeader === 'false') {
                showToast('Não foi possível converter o áudio para MP3.', true);
            }

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            triggerBrowserDownload(objectUrl, selection.fileName, mediaType);
            showFeedback('Download concluído! Confira sua pasta de downloads.');
            showToast('Download concluído! Confira sua pasta de downloads.');

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
            const message = error instanceof Error ? error.message : 'Não foi possível baixar o arquivo.';
            showFeedback(message, true);
            showToast('Não foi possível baixar o arquivo.', true);

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
        if (selection.fileName) {
            params.set('filename', selection.fileName);
        }
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
        resolverSection.classList.remove('hidden');
        resetMediaState();
        downloadButtonCtrl?.reset();
        genericVideoButtonCtrl?.reset();
        genericAudioButtonCtrl?.reset();
        shareLink?.classList.add('hidden');
        showFeedback('Pronto para baixar outro vídeo!');
        showToast('Pronto para baixar outro vídeo!');
        if (captionBubble) {
            captionBubble.classList.remove('show');
            captionBubble.textContent = 'Clique para copiar';
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

    function setLoading(stateValue, message = 'Processando...') {
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

    async function copyCaptionToClipboard() {
        const text = videoCaption.textContent?.trim();
        if (!text) {
            showFeedback('Nenhuma legenda disponível para copiar.', true);
            showToast('Nenhuma legenda disponível para copiar.', true);
            return;
        }

        const pushCopiedEvent = async () => {
            const linkHash = await safeHash(state.media.video?.url || '');
            if (linkHash) {
                dl('caption_copied', { link_hash: linkHash });
            } else {
                dl('caption_copied', {});
            }
        };

        if (navigator.clipboard?.writeText) {
            navigator.clipboard
                .writeText(text)
                .then(async () => {
                    showFeedback('Legenda copiada para a área de transferência!');
                    showCaptionBubble();
                    showToast('Legenda copiada!');
                    await pushCopiedEvent();
                })
                .catch(() => fallbackCopy(text));
        } else {
            fallbackCopy(text);
            await pushCopiedEvent();
        }
    }

    function fallbackCopy(text) {
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
            showFeedback('Legenda copiada para a área de transferência!');
            showCaptionBubble();
            showToast('Legenda copiada!');
        } catch (error) {
            console.error(error);
            showFeedback('Não foi possível copiar a legenda.', true);
            showToast('Não foi possível copiar a legenda.', true);
        }
    }

    function copyPixKey(value) {
        if (!value) return;
        if (navigator.clipboard?.writeText) {
            navigator.clipboard
                .writeText(value)
                .then(() => {
                    showFeedback('Chave PIX copiada. Obrigado pelo apoio!');
                    showToast('Chave PIX copiada! Obrigado pelo apoio ❤');
                })
                .catch(() => fallbackCopyPix(value));
        } else {
            fallbackCopyPix(value);
        }
    }

    function fallbackCopyPix(value) {
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
            showFeedback('Chave PIX copiada. Obrigado pelo apoio!');
            showToast('Chave PIX copiada! Obrigado pelo apoio ❤');
        } catch (error) {
            console.error(error);
            showFeedback('Não foi possível copiar a chave PIX.', true);
            showToast('Não foi possível copiar a chave PIX.', true);
        }
    }

    function formatNumber(value) {
        return typeof value === 'number' ? value.toLocaleString('pt-BR') : '0';
    }

    function updateUrlWithQuery(link) {
        if (!window.history || typeof window.history.replaceState !== 'function') return;
        const current = new URL(window.location.href);
        current.searchParams.set('link', link);
        window.history.replaceState({}, '', current.toString());
    }

    function tryResolveFromQuery() {
        const current = new URL(window.location.href);
        const linkFromQuery = current.searchParams.get('link');
        if (!linkFromQuery) return;
        input.value = linkFromQuery;
        handleResolve(linkFromQuery);
    }

    function showCaptionBubble() {
        if (!captionBubble) return;
        captionBubble.textContent = 'Copiado!';
        captionBubble.classList.add('show');
        clearTimeout(captionBubbleTimer);
        captionBubbleTimer = setTimeout(() => {
            if (!captionBubble) return;
            captionBubble.classList.remove('show');
            captionBubble.textContent = 'Clique para copiar';
        }, 1400);
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
        const extension = mediaType === 'audio' ? '.mp3' : '.mp4';
        const fallbackName = fileName || `download-${Date.now()}${extension}`;
        anchor.href = objectUrl;
        anchor.download = fallbackName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
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
