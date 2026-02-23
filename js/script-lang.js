// Управление языками
// Поддерживаемые языки
const supportedLanguages = {
    ru: 'Русский',
    en: 'English',
    de: 'Deutsch',
    fr: 'Français',
    es: 'Español',
    it: 'Italiano',
    pt: 'Português',
    pl: 'Polski',
    uk: 'Українська',
    ja: '日本語',
    ko: '한국어',
    zh: '中文'
};

const languageCodes = Object.keys(supportedLanguages);

// Инициализация языка
function initLanguage() {
    // Сначала проверяем сохраненный язык
    const savedLanguage = localStorage.getItem('ktw_selected_language');

    if (savedLanguage && supportedLanguages[savedLanguage]) {
        currentLanguage = savedLanguage;
    } else {
        // Если нет сохраненного - используем автоопределение
        const userLanguage = navigator.language || navigator.userLanguage;
        const langCode = userLanguage.split('-')[0].toLowerCase();

        if (supportedLanguages[langCode]) {
            currentLanguage = langCode;
        } else {
            currentLanguage = 'en'; // По умолчанию английский
        }
    }

    // Обновляем UI
    updateLanguageUI();
    updateContentLanguage();
}

// Обновление UI выбора языка
function updateLanguageUI() {
    const languageButton = document.getElementById('currentLanguageCode');
    if (languageButton) {
        languageButton.textContent = currentLanguage;
    }
}

// Обновление контента на выбранном языке
function updateContentLanguage() {
    // Обновляем дисплеймер
    if (typeof tooltipTranslations !== 'undefined' && typeof initTooltip === 'function') {
        initTooltip();
    }

    // Обновляем фразы для печати
    if (typeof phrasesTranslations !== 'undefined') {
        phrases = phrasesTranslations[currentLanguage] || phrasesTranslations['en'];
    }

    // Обновляем футер
    const copyrightElement = document.getElementById('copyrightText');
    if (copyrightElement && typeof tooltipTranslations !== 'undefined') {
        const translations = tooltipTranslations[currentLanguage] || tooltipTranslations['en'];
        if (translations && translations.copyright) {
            copyrightElement.textContent = translations.copyright;
        }
    }

    // Перезагружаем статистику (тексты могут быть на разных языках)
    if (typeof loadVisitStats === 'function') {
        loadVisitStats();
    }

    // Обновляем подсказки
    if (typeof updateTipsLanguage === 'function') {
        updateTipsLanguage();
    }
}

// Инициализация выбора языка
function initLanguageSelector() {
    const languageButton = document.getElementById('languageButton');
    const languageDropdown = document.getElementById('languageDropdown');
    const languageGrid = document.getElementById('languageGrid');
    const languageSelector = languageButton?.parentElement;

    if (!languageButton || !languageDropdown || !languageGrid) return;

    // Создаем опции языков
    languageCodes.forEach(code => {
        const option = document.createElement('button');
        option.className = 'language-option';
        if (code === currentLanguage) {
            option.classList.add('selected');
        }
        option.textContent = supportedLanguages[code];
        option.dataset.lang = code;

        option.addEventListener('click', () => {
            selectLanguage(code);
        });

        languageGrid.appendChild(option);
    });

    // Открытие/закрытие выпадающего списка
    languageButton.addEventListener('click', (e) => {
        e.stopPropagation();
        languageSelector?.classList.toggle('active');
    });

    // Закрытие при клике вне
    document.addEventListener('click', (e) => {
        if (!languageSelector?.contains(e.target)) {
            languageSelector?.classList.remove('active');
        }
    });

    // Предотвращаем закрытие tooltip при клике на селектор
    languageSelector?.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

// Выбор языка
function selectLanguage(langCode) {
    if (!supportedLanguages[langCode]) return;

    currentLanguage = langCode;

    // Сохраняем выбор
    localStorage.setItem('ktw_selected_language', langCode);

    // Обновляем UI
    updateLanguageUI();

    // Обновляем выбранную опцию
    document.querySelectorAll('.language-option').forEach(option => {
        if (option.dataset.lang === langCode) {
            option.classList.add('selected');
        } else {
            option.classList.remove('selected');
        }
    });

    // Закрываем выпадающий список
    const languageSelector = document.querySelector('.language-selector');
    languageSelector?.classList.remove('active');

    // Обновляем контент
    updateContentLanguage();

    // Если анимация печатания активна, перезапускаем с новой фразой
    if (typeof resetToAnimationMode === 'function' && !isEditingMode) {
        setTimeout(() => {
            if (!isEditingMode && !isTyping && !isDeleting) {
                currentPhraseIndex = 0;
                currentCharIndex = 0;
                resetToAnimationMode();
            }
        }, 100);
    }
}

// Инициализация при загрузке DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initLanguage();
        initLanguageSelector();
    });
} else {
    // DOM уже загружен
    initLanguage();
    initLanguageSelector();
}

