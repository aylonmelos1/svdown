const donationBlocks = document.querySelectorAll('.donation-blurb[data-pix-key]');
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
const toast = document.getElementById('toast');

if (donationBlocks.length || donationModal) {
    const lang = document.body?.dataset?.lang === 'en' ? 'en' : 'pt';
    const translations = {
        pt: {
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
            copied: 'Copiado!',
            copyHint: 'Toque para copiar'
        },
        en: {
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
            copied: 'Copied!',
            copyHint: 'Tap to copy'
        }
    };

    const tr = (key) => {
        const table = translations[lang] || translations.pt;
        return table[key] ?? translations.pt[key] ?? key;
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
        defaultAmount: lang === 'en' ? '10.00' : '10,00'
    };

    let lastFocusedElement = null;
    let payloadBubbleTimer = null;

    donationBlocks.forEach(block => initDonationBlock(block));
    if (donationModal) {
        donationModalDismissTriggers.forEach(trigger => {
            trigger.addEventListener('click', closeDonationModal);
        });
        donationModalAmountInput?.addEventListener('input', () => {
            updateDonationPayload(donationModalAmountInput.value, { formatInput: false });
        });
        donationModalQuickButtons.forEach(button => {
            button.addEventListener('click', () => selectQuickAmount(button));
        });
        donationModalPayloadDisplay?.addEventListener('click', handlePayloadCopy);
        donationModalPayloadDisplay?.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handlePayloadCopy();
            }
        });
        document.addEventListener('keydown', handleDonationModalKeydown);
        setPayloadBubbleDefault();
        if (donationModalPayloadDisplay) {
            donationModalPayloadDisplay.textContent = tr('pixPayloadPlaceholder');
            donationModalPayloadDisplay.classList.add('empty');
            donationModalPayloadDisplay.setAttribute('aria-label', tr('pixPayloadPlaceholder'));
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

        resetModalFeedback();
        setPayloadBubbleDefault();
        if (donationModalAmountInput) {
            donationModalAmountInput.value = donationContext.defaultAmount || '';
        }
        updateDonationPayload(donationContext.defaultAmount || '');

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
        setPayloadBubbleDefault();
        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
            try {
                lastFocusedElement.focus();
            } catch (_) {
                // ignore focus errors
            }
        }
        lastFocusedElement = null;
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
            updateModalFeedback(tr('pixPayloadUnavailable'), true);
            showToast(tr('pixPayloadUnavailable'), true);
            return;
        }
        copyTextValue(
            donationContext.payload,
            tr('pixPayloadCopyFeedback'),
            tr('pixPayloadCopyToast'),
            tr('pixPayloadCopyFailed')
        );
        showPayloadBubbleCopied();
    }

    function updateDonationPayload(rawValue, options = {}) {
        const parsed = parsePixAmount(rawValue);
        if (parsed.error) {
            donationContext.payload = '';
            donationContext.lastValidAmount = 0;
            updateModalFeedback(parsed.error, true);
            updatePayloadDisplay(tr('pixPayloadPlaceholder'), true);
            hideQr();
            setPayloadBubbleDefault();
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

        donationContext.lastValidAmount = parsed.amount;
        let payload = '';
        try {
            payload = buildPixPayload({
                key: donationContext.normalizedKey,
                name: donationContext.name,
                city: donationContext.city,
                reference: donationContext.reference,
                amount: parsed.amount
            });
        } catch (error) {
            console.error('SVDown: erro ao montar payload PIX', error);
        }

        donationContext.payload = payload;
        if (!payload) {
            updateModalFeedback(tr('pixPayloadUnavailable'), true);
            updatePayloadDisplay(tr('pixPayloadPlaceholder'), true);
            hideQr();
            setPayloadBubbleDefault();
            return;
        }

        const message = parsed.amount > 0
            ? tr('pixAmountReady').replace('{{value}}', formatCurrencyValue(parsed.amount))
            : tr('pixAmountReadyNoValue');
        updateModalFeedback(message, false);
        updatePayloadDisplay(payload, false);
        renderQr(payload);
        setPayloadBubbleDefault(true);
    }

    function updateModalFeedback(message, isError) {
        if (!donationModalFeedback) return;
        donationModalFeedback.textContent = message;
        donationModalFeedback.classList.toggle('error', Boolean(isError));
    }

    function resetModalFeedback() {
        if (!donationModalFeedback) return;
        donationModalFeedback.textContent = '';
        donationModalFeedback.classList.remove('error');
    }

    function updatePayloadDisplay(text, isPlaceholder) {
        if (!donationModalPayloadDisplay) return;
        donationModalPayloadDisplay.textContent = text;
        donationModalPayloadDisplay.classList.toggle('empty', Boolean(isPlaceholder));
        donationModalPayloadDisplay.setAttribute(
            'aria-label',
            isPlaceholder ? tr('pixPayloadPlaceholder') : tr('copyHint')
        );
        donationModalPayloadDisplay.scrollTop = 0;
    }

    function hideQr() {
        if (donationModalQrWrapper) {
            donationModalQrWrapper.hidden = true;
        }
        if (donationModalQrImage) {
            donationModalQrImage.removeAttribute('src');
        }
    }

    function renderQr(payload) {
        if (!donationModalQrWrapper || !donationModalQrImage) return;
        const baseUrl = 'https://api.qrserver.com/v1/create-qr-code/';
        const size = 220;
        const url = `${baseUrl}?size=${size}x${size}&margin=0&data=${encodeURIComponent(payload)}&t=${Date.now()}`;
        donationModalQrImage.onerror = () => {
            hideQr();
            updateModalFeedback(tr('pixPayloadUnavailable'), true);
            showToast(tr('pixPayloadUnavailable'), true);
        };
        donationModalQrImage.decoding = 'async';
        donationModalQrImage.referrerPolicy = 'no-referrer';
        donationModalQrImage.src = url;
        donationModalQrWrapper.hidden = false;
    }

    function copyTextValue(value, feedbackMessage, toastMessage, failureMessage) {
        if (!value) {
            if (failureMessage) {
                updateModalFeedback(failureMessage, true);
                showToast(failureMessage, true);
            }
            return;
        }

        const onSuccess = () => {
            if (feedbackMessage) {
                updateModalFeedback(feedbackMessage, false);
            }
            if (toastMessage) {
                showToast(toastMessage);
            }
        };

        const onFailure = () => {
            if (failureMessage) {
                updateModalFeedback(failureMessage, true);
                showToast(failureMessage, true);
            }
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

    function showToast(message, isError = false) {
        if (!toast || !message) return;
        toast.textContent = message;
        toast.classList.toggle('error', Boolean(isError));
        toast.classList.remove('hidden');
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.classList.add('hidden'), 250);
        }, 2200);
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

    function setPayloadBubbleDefault(show = false) {
        if (!donationModalPayloadBubble) return;
        clearTimeout(payloadBubbleTimer);
        donationModalPayloadBubble.textContent = tr('copyHint');
        donationModalPayloadBubble.classList.toggle('show', Boolean(show));
    }

    function showPayloadBubbleCopied() {
        if (!donationModalPayloadBubble) return;
        donationModalPayloadBubble.textContent = tr('copied');
        donationModalPayloadBubble.classList.add('show');
        clearTimeout(payloadBubbleTimer);
        payloadBubbleTimer = setTimeout(() => {
            setPayloadBubbleDefault(true);
        }, 1400);
    }
}

