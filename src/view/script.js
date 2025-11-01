const form = document.getElementById('resolver-form');
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

if (!form || !input || !downloadLink) {
  console.warn('SVDown: elementos essenciais não encontrados, abortando script.');
} else {
  const ensureDownloadButtonParts = () => {
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
  };

  const { spinner: downloadSpinner, label: downloadLabel } = ensureDownloadButtonParts();
  const originalDownloadLabel = downloadLabel.textContent || 'Baixar vídeo';
  const submitButton = form.querySelector('button[type="submit"]');
  let currentDownloadUrl = '';

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const link = input.value.trim();
    if (!link) {
      showFeedback('Informe um link da Shopee.', true);
    return;
  }

  setLoading(true, 'Resolvendo link…');
  showFeedback('Resolvendo link…');

  try {
    const response = await fetch('/api/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || 'Não foi possível resolver o link.');
    }

    renderResult(data);
    showFeedback('Link resolvido com sucesso!');
  } catch (error) {
    console.error(error);
    showFeedback(error.message || 'Erro ao resolver link.', true);
    resultSection.classList.add('hidden');
  } finally {
    setLoading(false);
  }
  });

  downloadLink.addEventListener('click', async event => {
    if (!currentDownloadUrl) return;
    event.preventDefault();

    try {
      setLoading(true, 'Baixando vídeo limpo…');
      setDownloadLoading(true);
      showFeedback('Preparando download...');

      const response = await fetch(currentDownloadUrl);
      if (!response.ok) {
        throw new Error('Falha ao iniciar download.');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const tempLink = document.createElement('a');
      tempLink.href = objectUrl;
      tempLink.download = `shopee-video-${Date.now()}.mp4`;
      document.body.appendChild(tempLink);
      tempLink.click();
      tempLink.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0);

      showFeedback('Download concluído! Confira sua pasta de downloads.');
    } catch (error) {
      console.error(error);
      showFeedback(error.message || 'Não foi possível baixar o vídeo.', true);
    } finally {
      setDownloadLoading(false);
      setLoading(false);
    }
  });

  function renderResult(data) {
    const { pageProps, directVideoUrl, shareUrl } = data;
    const videoInfo = pageProps?.mediaInfo?.video;
    const userInfo = pageProps?.userInfo || pageProps?.userDetail;
    const counts = pageProps?.mediaInfo?.count;

    if (!directVideoUrl) {
      showFeedback('Vídeo não encontrado para este link.', true);
      resultSection.classList.add('hidden');
      currentDownloadUrl = '';
      downloadLink.href = '#';
      setDownloadLoading(false);
      return;
    }

    videoElement.src = directVideoUrl;
    const directDownloadUrl = `/api/download?url=${encodeURIComponent(directVideoUrl)}`;
    downloadLink.href = directDownloadUrl;
    downloadLink.removeAttribute('download');
    currentDownloadUrl = directDownloadUrl;
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

  function showFeedback(message, isError = false) {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle('error', isError);
    feedback.classList.remove('hidden');
  }

  function setLoading(state, message = 'Processando…') {
    if (message && loaderText) {
      loaderText.textContent = message;
    }
    if (loader) {
      loader.classList.toggle('hidden', !state);
    }
    if (submitButton) {
      submitButton.disabled = state;
    }
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

  function formatNumber(value) {
    return typeof value === 'number' ? value.toLocaleString('pt-BR') : '0';
  }
}
