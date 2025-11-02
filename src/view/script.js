
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

    function handleResolve(link) {
        if (!link) {
            showFeedback('Informe um link da Shopee.', true);
            return;
        }

        setLoading(true, 'Resolvendo link...');
        showFeedback('Resolvendo link...');

        fetch('/api/resolve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    link
                }),
            })
            .then(async response => {
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data?.error || 'Não foi possível resolver o link.');
                }
                renderResult(data);
                showFeedback('Link resolvido com sucesso!');
                updateUrlWithQuery(link);
            })
            .catch(error => {
                console.error(error);
                showFeedback(error.message || 'Erro ao resolver link.', true);
                resultSection.classList.add('hidden');
            })
            .finally(() => setLoading(false));
    }

    function handleDownload(event) {
        if (!currentDownloadUrl) return;
        event.preventDefault();

        setLoading(true, 'Preparando download...');
        setDownloadLoading(true);
        showFeedback('Seu vídeo está sendo preparado. Isso pode levar alguns instantes...');

        fetch(currentDownloadUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Falha ao iniciar download.');
                }
                if (response.headers.get('X-Metadata-Cleaned') === 'false') {
                    showToast('Não foi possível remover os metadados do vídeo.', true);
                }
                return response.blob();
            })
            .then(blob => {
                const objectUrl = URL.createObjectURL(blob);
                triggerBrowserDownload(objectUrl);
                showFeedback('Download concluído! Confira sua pasta de downloads.');
                showToast('Download concluído! Confira sua pasta de downloads.');
            })
            .catch(error => {
                console.error(error);
                showFeedback(error.message || 'Não foi possível baixar o vídeo.', true);
                showToast('Não foi possível baixar o vídeo.', true);
            })
            .finally(() => {
                setDownloadLoading(false);
                setLoading(false);
            });
    }

    function renderResult(data) {
        const {
            pageProps,
            directVideoUrl,
            shareUrl
        } = data;
        const videoInfo = pageProps?.mediaInfo?.video;
        const userInfo = pageProps?.mediaInfo?.userInfo || pageProps?.userDetail;
        const counts = pageProps?.mediaInfo?.count;

        if (!directVideoUrl) {
            showFeedback('Vídeo não encontrado para este link.', true);
            resultSection.classList.add('hidden');
            resetDownloadLink();
            return;
        }

        const fallbackUrl = videoInfo?.watermarkVideoUrl;

        videoElement.src = directVideoUrl;
        const params = new URLSearchParams({
            url: directVideoUrl
        });
        if (fallbackUrl) params.set('fallback', fallbackUrl);
        currentDownloadUrl = `/api/download?${params.toString()}`;
        downloadLink.href = currentDownloadUrl;
        setDownloadLoading(false);

        if (shareLink) {
            shareLink.href = shareUrl;
        }

        creatorName.textContent = userInfo?.videoUserName || 'Criador desconhecido';
        videoCaption.textContent = videoInfo?.caption || 'Sem descrição definida.';
        likeCount.textContent = formatNumber(counts?.likeCount);
        commentCount.textContent = formatNumber(counts?.commentCount);

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

        return {
            spinner,
            label
        };
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
        anchor.download = `shopee-video-${Date.now()}.mp4`;
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

    function copyCaptionToClipboard() {
        const text = videoCaption.textContent?.trim();
        if (!text) {
            showFeedback('Nenhuma legenda disponível para copiar.', true);
            showToast('Nenhuma legenda disponível para copiar.', true);
            return;
        }

        if (navigator.clipboard?.writeText) {
            navigator.clipboard
                .writeText(text)
                .then(() => {
                    showFeedback('Legenda copiada para a área de transferência!');
                    showCaptionBubble();
                    showToast('Legenda copiada!');
                })
                .catch(() => fallbackCopy(text));
        } else {
            fallbackCopy(text);
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
