// === Analytics helpers (GTM) ===
window.dataLayer = window.dataLayer || [];
function dl(eventName, params = {}) {
  window.dataLayer.push({ event: eventName, ...params });
}
async function sha256Hex(str){
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
// ===============================

const resolverSection = document.getElementById('resolver-form');
const input = document.getElementById('link-input');
const feedback = document.getElementById('feedback');
const resultSection = document.getElementById('result-section');
const videoElement = document.getElementById('video-player');
const creatorName = document.getElementById('creator-name');
const videoCaption = document.getElementById('video-caption');
const likeCount = document.getElementById('like-count');
const commentCount = document.getElementById('comment-count');
const downloadLink = document.getElementById('download-link');
const shareLink = document.getElementById('share-link');
const loader = document.getElementById('loading-indicator');
const loaderText = document.getElementById('loading-text');
const resolveButton = document.getElementById('resolve-button');
const captionBubble = document.getElementById('caption-hint');
const toast = document.getElementById('toast');
let toastTimer;

if (!resolverSection || !input || !resolveButton || !downloadLink || !videoElement || !videoCaption) {
    console.warn('SVDown: elementos essenciais não encontrados, script abortado.');
} else {
    const {
        spinner: downloadSpinner,
        label: downloadLabel
    } = ensureDownloadButtonParts();
    const captionHint = document.getElementById('caption-hint');
    const originalDownloadLabel = downloadLabel.textContent?.trim() || 'Baixar vídeo';
    let currentDownloadUrl = '';
    let resolveStartTime = 0;

    resolveButton.addEventListener('click', () => handleResolve(input.value.trim()));
    downloadLink.addEventListener('click', handleDownload);
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

    const copyPixButton = document.getElementById('copy-pix');
    copyPixButton?.addEventListener('click', () => copyPixKey('5573991060975'));
    const newDownloadButton = document.getElementById('new-download');
    newDownloadButton?.addEventListener('click', resetForm);

    tryResolveFromQuery();

    // === Atualizado para async para podermos gerar hash e medir tempo ===
    async function handleResolve(link) {
        if (!link) {
            showFeedback('Informe um link.', true);
            return;
        }

        // métricas: início de resolução
        resolveStartTime = performance.now();
        let linkHash = '';
        let domain = '';
        let hasQuery = false;
        try {
            linkHash = await sha256Hex(link);
            const u = new URL(link);
            domain = u.hostname;
            hasQuery = !!u.search;
        } catch (_) {
            // URL inválida não quebra o fluxo; ainda assim seguimos sem domain/hasQuery
        }
        dl('paste_link', { link_hash: linkHash, domain, has_query: hasQuery, ts: Date.now() });

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
                const responseTimeMs = Math.round(performance.now() - resolveStartTime);
                dl('resolve_error', {
                    link_hash: linkHash,
                    error_message: (data && data.error) || 'Não foi possível resolver o link.',
                    response_time_ms: responseTimeMs
                });
                throw new Error(data?.error || 'Não foi possível resolver o link.');
            }

            if (data.downloads || data.formats) {
                renderMultiResult(data);
            } else {
                renderResult(data);
            }
            showFeedback('Link resolvido com sucesso!');
            updateUrlWithQuery(link);

            // métricas: sucesso
            const responseTimeMs = Math.round(performance.now() - resolveStartTime);

            dl('resolve_success', {
                link_hash: linkHash,
                response_time_ms: responseTimeMs
            });

        } catch (error) {
            console.error(error);
            showFeedback(error.message || 'Erro ao resolver link.', true);
            resultSection.classList.add('hidden');
        } finally {
            setLoading(false);
        }
    }

    // === Atualizado para async para gerar hash e medir eventos ===
    async function handleDownload(event) {
        if (!currentDownloadUrl) return;
        event.preventDefault();

        // métrica: clique no download
        try {
            const dlHash = await sha256Hex(currentDownloadUrl);
            dl('download_click', {
                link_hash: dlHash,
                ts: Date.now()
                // Se você tiver 'format' ou 'quality', inclua aqui.
            });
        } catch (_) {}

        setLoading(true, 'Preparando download...');
        setDownloadLoading(true);
        showFeedback('Seu vídeo está sendo preparado. Isso pode levar alguns instantes...');

        try {
            const response = await fetch(currentDownloadUrl);
            if (!response.ok) {
                const dlHash = await sha256Hex(currentDownloadUrl);
                dl('download_error', {
                    link_hash: dlHash,
                    error_message: 'Falha ao iniciar download.'
                });
                throw new Error('Falha ao iniciar download.');
            }
            if (response.headers.get('X-Metadata-Cleaned') === 'false') {
                showToast('Não foi possível remover os metadados do vídeo.', true);
            }

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            triggerBrowserDownload(objectUrl);
            showFeedback('Download concluído! Confira sua pasta de downloads.');
            showToast('Download concluído! Confira sua pasta de downloads.');

            // métrica: download completo
            const dlHash = await sha256Hex(currentDownloadUrl);
            dl('download_complete', {
                link_hash: dlHash,
                success: true,
                bytes_estimated: blob.size
            });

        } catch (error) {
            console.error(error);
            showFeedback(error.message || 'Não foi possível baixar o vídeo.', true);
            showToast('Não foi possível baixar o vídeo.', true);

            // métrica: erro no download (se já não foi enviado acima)
            try {
                const dlHash = await sha256Hex(currentDownloadUrl);
                dl('download_error', {
                    link_hash: dlHash,
                    error_message: error.message || 'unknown'
                });
            } catch (_) {}
        } finally {
            setDownloadLoading(false);
            setLoading(false);
        }
    }

    function renderMultiResult(data) {
        const { title, thumbnail, downloads, formats } = data;
        const actions = document.querySelector('#result-section .actions');
        actions.innerHTML = ''; // Clear previous results

        videoElement.src = thumbnail;
        videoElement.poster = thumbnail;

        creatorName.textContent = title;
        videoCaption.textContent = 'Selecione um formato para baixar';

        const items = downloads || formats;

        items.forEach(item => {
            const link = document.createElement('a');
            link.href = item.url;
            link.textContent = item.text || item.label;
            link.className = 'btn';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            actions.appendChild(link);
        });

        resultSection.classList.remove('hidden');
    }

    function renderResult(data) {
        const { pageProps, directVideoUrl, shareUrl, title, thumbnail } = data;

        if (!directVideoUrl) {
            showFeedback('Vídeo não encontrado para este link.', true);
            resultSection.classList.add('hidden');
            resetDownloadLink();
            return;
        }

        videoElement.src = directVideoUrl;
        if (thumbnail) {
            videoElement.poster = thumbnail;
        }

        const params = new URLSearchParams({ url: directVideoUrl });
        if (pageProps?.mediaInfo?.video?.watermarkVideoUrl) {
            params.set('fallback', pageProps.mediaInfo.video.watermarkVideoUrl);
        }
        currentDownloadUrl = `/api/download?${params.toString()}`;
        downloadLink.href = currentDownloadUrl;
        setDownloadLoading(false);

        if (shareUrl) {
            shareLink.href = shareUrl;
        }

        creatorName.textContent = pageProps?.mediaInfo?.userInfo?.videoUserName || title || 'Criador desconhecido';
        videoCaption.textContent = pageProps?.mediaInfo?.video?.caption || 'Sem descrição definida.';

        const likeCountContainer = document.getElementById('like-count').parentElement;
        const commentCountContainer = document.getElementById('comment-count').parentElement;

        if (pageProps?.mediaInfo?.count) {
            likeCount.textContent = formatNumber(pageProps.mediaInfo.count.likeCount);
            commentCount.textContent = formatNumber(pageProps.mediaInfo.count.commentCount);
            likeCountContainer.style.display = 'list-item';
            commentCountContainer.style.display = 'list-item';
        } else {
            likeCountContainer.style.display = 'none';
            commentCountContainer.style.display = 'none';
        }

        resultSection.classList.remove('hidden');
    }

    function ensureDownloadButtonParts() {
        let spinner = downloadLink.querySelector('.btn-spinner');
        if (!spinner) {
            spinner = document.createElement('span');
            spinner.className = 'btn-spinner hidden';
            spinner.setAttribute('aria-hidden', 'true');
            downloadLink.prepend(spinner);
        }

        let label = downloadLink.querySelector('.btn-label');
        if (!label) {
            label = document.createElement('span');
            label.className = 'btn-label';
            label.textContent = 'Baixar vídeo';
            downloadLink.append(label);
        }

        return { spinner, label };
    }

    function showFeedback(message, isError = false) {
        if (!feedback) return;
        feedback.textContent = message;
        feedback.classList.toggle('error', isError);
        feedback.classList.remove('hidden');
    }

    function setLoading(state, message = 'Processando...') {
        if (message && loaderText) loaderText.textContent = message;
        if (loader) loader.classList.toggle('hidden', !state);
        resolveButton.disabled = state;
        input.disabled = state;
        downloadLink.classList.toggle('disabled', state);
        downloadLink.setAttribute('aria-disabled', String(state));
    }

    function setDownloadLoading(state) {
        downloadSpinner.classList.toggle('hidden', !state);
        downloadLabel.textContent = state ? 'Baixando...' : originalDownloadLabel;
        downloadLink.classList.toggle('disabled', state);
        downloadLink.setAttribute('aria-disabled', String(state));
    }

    function triggerBrowserDownload(objectUrl) {
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = `video-${Date.now()}.mp4`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    }

    function resetDownloadLink() {
        currentDownloadUrl = '';
        downloadLink.href = '#';
        setDownloadLoading(false);
    }

    function resetForm() {
        const actions = document.querySelector('#result-section .actions');
        actions.innerHTML = '';
        input.value = '';
        resetDownloadLink();
        resultSection.classList.add('hidden');
        resolverSection.classList.remove('hidden');
        showFeedback('Pronto para baixar outro vídeo!');
        showToast('Pronto para baixar outro vídeo!');
        if (captionBubble) {
            captionBubble.classList.remove('hidden');
            captionBubble.classList.remove('show');
            captionBubble.textContent = 'Clique para copiar';
        }
    }

    // === Atualizado para async para registrar 'caption_copied' ===
    async function copyCaptionToClipboard() {
        const text = videoCaption.textContent?.trim();
        if (!text) {
            showFeedback('Nenhuma legenda disponível para copiar.', true);
            showToast('Nenhuma legenda disponível para copiar.', true);
            return;
        }

        const pushCopiedEvent = async () => {
            try {
                if (currentDownloadUrl) {
                    const dlHash = await sha256Hex(currentDownloadUrl);
                    dl('caption_copied', { link_hash: dlHash });
                } else {
                    dl('caption_copied', {});
                }
            } catch (_) {
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

    let captionBubbleTimer;

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
}
