const form = document.getElementById('metadata-form');
const fileInput = document.getElementById('metadata-file');
const dropZone = document.getElementById('upload-zone');
const selectButton = document.getElementById('select-file');
const submitButton = document.getElementById('metadata-submit');
const feedback = document.getElementById('metadata-feedback');
const toast = document.getElementById('toast');
const metadataToast = document.getElementById('metadata-toast');
const metadataToastText = metadataToast?.querySelector('.metadata-toast__text') || null;
const uploadHint = document.querySelector('[data-upload-hint]');

let toastTimer;
let metadataToastTimer;

const messages = {
    selectFile: 'Selecione um arquivo para continuar.',
    processing: 'Limpando metadados…',
    success: 'Arquivo limpo com sucesso!',
    error: 'Não foi possível limpar os metadados. Tente novamente.',
};

initUploadZone();

function initUploadZone() {
    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (event) => {
        event.preventDefault();
        dropZone.classList.remove('dragover');
        if (event.dataTransfer?.files?.length) {
            fileInput.files = event.dataTransfer.files;
            updateUploadHint();
        }
    });
    fileInput.addEventListener('change', updateUploadHint);
    selectButton?.addEventListener('click', (event) => {
        event.stopPropagation();
        fileInput.click();
    });
}

form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!fileInput?.files?.length) {
        showFeedback(messages.selectFile, true);
        showToast(messages.selectFile, true);
        return;
    }

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);

    setLoading(true);
    try {
        const response = await fetch('/api/clean/upload', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error(await extractError(response));
        }

        if (response.headers.get('X-Metadata-Cleaned') === 'true') {
            showMetadataToast();
        }

        const blob = await response.blob();
        const downloadName =
            extractFileNameFromContentDisposition(response.headers.get('Content-Disposition')) ||
            buildFallbackName(file.name);

        triggerDownload(blob, downloadName);
        showFeedback(messages.success);
        showToast(messages.success);
    } catch (error) {
        console.error(error);
        const message = error instanceof Error && error.message ? error.message : messages.error;
        showFeedback(message, true);
        showToast(message, true);
    } finally {
        setLoading(false);
    }
});

function updateUploadHint() {
    if (!uploadHint) return;
    if (fileInput?.files?.length) {
        uploadHint.textContent = `Selecionado: ${fileInput.files[0].name}`;
    } else {
        uploadHint.textContent = 'Ainda nenhum arquivo selecionado.';
    }
}

function setLoading(isLoading) {
    if (!submitButton) return;
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? messages.processing : 'Remover metadados';
}

async function extractError(response) {
    try {
        const data = await response.json();
        if (typeof data?.error === 'string' && data.error.trim()) {
            return data.error;
        }
    } catch (_) {
        // ignore
    }
    return messages.error;
}

function triggerDownload(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function extractFileNameFromContentDisposition(headerValue) {
    if (!headerValue) return '';
    const filenameStarMatch = headerValue.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i);
    if (filenameStarMatch?.[1]) {
        return decodeURIComponentSafe(filenameStarMatch[1]);
    }
    const filenameMatch = headerValue.match(/filename\s*=\s*"?([^";]+)"?/i);
    if (filenameMatch?.[1]) {
        return decodeURIComponentSafe(filenameMatch[1]);
    }
    return '';
}

function decodeURIComponentSafe(value) {
    try {
        return decodeURIComponent(value.trim());
    } catch {
        return value.trim();
    }
}

function buildFallbackName(originalName) {
    const base = sanitizeFileName(originalName || 'video');
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const timestamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(
        now.getUTCHours()
    )}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
    return `${base || 'svdown-clean'}-${timestamp}.mp4`;
}

function sanitizeFileName(value) {
    return (value || '')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
        .replace(/\s{2,}/g, ' ')
        .replace(/\.\.+/g, '.')
        .replace(/^[-.]+|[-.]+$/g, '')
        .trim();
}

function showFeedback(message, isError = false) {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle('error', isError);
    feedback.classList.remove('hidden');
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
    }, 2400);
}

function showMetadataToast(message = 'Arquivo livre de metadados') {
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
    }, 2600);
}
