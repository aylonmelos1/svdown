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

if (!resolverSection || !input || !resolveButton || !downloadLink || !videoElement) {
  console.warn('SVDown: elementos essenciais não encontrados, script abortado.');
} else {
  const { spinner: downloadSpinner, label: downloadLabel } = ensureDownloadButtonParts();
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

  tryResolveFromQuery();

  function handleResolve(link) {
    if (!link) {
      showFeedback('Informe um link da Shopee.', true);
      return;
    }

    setLoading(true, 'Resolvendo link…');
    showFeedback('Resolvendo link…');

    fetch('/api/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link }),
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

    setLoading(true, 'Baixando vídeo limpo…');
    setDownloadLoading(true);
    showFeedback('Preparando download...');

    fetch(currentDownloadUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error('Falha ao iniciar download.');
        }
        return response.blob();
      })
      .then(blob => {
        const objectUrl = URL.createObjectURL(blob);
        triggerBrowserDownload(objectUrl);
        showFeedback('Download concluído! Confira sua pasta de downloads.');
      })
      .catch(error => {
        console.error(error);
        showFeedback(error.message || 'Não foi possível baixar o vídeo.', true);
      })
      .finally(() => {
        setDownloadLoading(false);
        setLoading(false);
      });
  }

  function renderResult(data) {
    const { pageProps, directVideoUrl, shareUrl } = data;
    const videoInfo = pageProps?.mediaInfo?.video;
    const userInfo = pageProps?.userInfo || pageProps?.userDetail;
    const counts = pageProps?.mediaInfo?.count;

    if (!directVideoUrl) {
      showFeedback('Vídeo não encontrado para este link.', true);
      resultSection.classList.add('hidden');
      resetDownloadLink();
      return;
    }

    videoElement.src = directVideoUrl;
    currentDownloadUrl = `/api/download?url=${encodeURIComponent(directVideoUrl)}`;
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

    return { spinner, label };
  }

  function showFeedback(message, isError = false) {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle('error', isError);
    feedback.classList.remove('hidden');
  }

  function setLoading(state, message = 'Processando…') {
    if (message && loaderText) loaderText.textContent = message;
    if (loader) loader.classList.toggle('hidden', !state);
    resolveButton.disabled = state;
    input.disabled = state;
    downloadLink.classList.toggle('disabled', state);
    downloadLink.setAttribute('aria-disabled', String(state));
  }

  function setDownloadLoading(state) {
    downloadSpinner.classList.toggle('hidden', !state);
    downloadLabel.textContent = state ? 'Baixando…' : originalDownloadLabel;
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
}
