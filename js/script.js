// Определение языка (будет переопределено в script-lang.js)
let currentLanguage = 'en';

// Переводы фраз - популярные фильмы и сериалы
const phrasesTranslations = {
    ru: [
        'Найдется фильм в один запрос!',
        'Побег из Шоушенка',
        'Форрест Гамп',
        'Криминальное чтиво',
        'Зеленая миля',
        'Властелин колец: Братство кольца',
        'Гарри Поттер и философский камень',
        'Титаник',
        'Терминатор',
        'Чужой',
        'Аватар',
        'Пираты Карибского моря',
        'Мстители',
        'Джокер',
        'Паразиты',
        'Начало',
        'Матрица',
        'Интерстеллар',
        'Темный рыцарь',
        'Во все тяжкие',
        'Игра престолов',
        'Очень странные дела',
        'Корона',
        'Друзья',
        'Теория большого взрыва',
        'Шерлок',
        'Викинги',
        'Мир дикого запада',
        'Черное зеркало',
        'Анатомия страсти',
        'Офис',
        'Хаус',
        'Остаться в живых',
        'Сверхъестественное',
        'Чернобыль',
        'Безумцы'
    ],
    en: [
        'Find a movie in one query!',
        'The Shawshank Redemption',
        'Forrest Gump',
        'Pulp Fiction',
        'The Green Mile',
        'The Lord of the Rings: The Fellowship of the Ring',
        'Harry Potter and the Philosopher\'s Stone',
        'Titanic',
        'The Terminator',
        'Alien',
        'Avatar',
        'Pirates of the Caribbean',
        'The Avengers',
        'Joker',
        'Parasite',
        'Inception',
        'The Matrix',
        'Interstellar',
        'The Dark Knight',
        'Breaking Bad',
        'Game of Thrones',
        'Stranger Things',
        'The Crown',
        'Friends',
        'The Big Bang Theory',
        'Sherlock',
        'Vikings',
        'Westworld',
        'Black Mirror',
        'Grey\'s Anatomy',
        'The Office',
        'House',
        'Lost',
        'Supernatural',
        'Chernobyl',
        'Mad Men'
    ],
    de: [
        'Ein Film wird mit einer Anfrage gefunden!',
        'Die Verurteilten',
        'Forrest Gump',
        'Pulp Fiction',
        'Die grüne Meile',
        'Der Herr der Ringe: Die Gefährten',
        'Harry Potter und der Stein der Weisen',
        'Titanic',
        'Terminator',
        'Alien',
        'Avatar',
        'Fluch der Karibik',
        'Marvel\'s The Avengers',
        'Joker',
        'Parasite',
        'Inception',
        'Matrix',
        'Interstellar',
        'The Dark Knight',
        'Breaking Bad',
        'Game of Thrones',
        'Stranger Things',
        'The Crown',
        'Friends',
        'The Big Bang Theory',
        'Sherlock',
        'Vikings',
        'Westworld',
        'Black Mirror',
        'Grey\'s Anatomy',
        'The Office',
        'House',
        'Lost',
        'Supernatural',
        'Chernobyl',
        'Mad Men'
    ],
    fr: [
        'Trouvez un film en une requête!',
        'Les Évadés',
        'Forrest Gump',
        'Pulp Fiction',
        'La Ligne verte',
        'Le Seigneur des anneaux: La Communauté de l\'anneau',
        'Harry Potter à l\'école des sorciers',
        'Titanic',
        'Terminator',
        'Alien',
        'Avatar',
        'Pirates des Caraïbes',
        'Avengers',
        'Joker',
        'Parasite',
        'Inception',
        'Matrix',
        'Interstellar',
        'The Dark Knight',
        'Breaking Bad',
        'Le Trône de Fer',
        'Stranger Things',
        'The Crown',
        'Friends',
        'The Big Bang Theory',
        'Sherlock',
        'Vikings',
        'Westworld',
        'Black Mirror',
        'Grey\'s Anatomy',
        'The Office',
        'Dr House',
        'Lost',
        'Supernatural',
        'Tchernobyl',
        'Mad Men'
    ],
    es: [
        'Encuentra una película en una consulta!',
        'Cadena perpetua',
        'Forrest Gump',
        'Pulp Fiction',
        'La milla verde',
        'El señor de los anillos: La comunidad del anillo',
        'Harry Potter y la piedra filosofal',
        'Titanic',
        'Terminator',
        'Alien',
        'Avatar',
        'Piratas del Caribe',
        'Los Vengadores',
        'Joker',
        'Parásitos',
        'Origen',
        'Matrix',
        'Interestelar',
        'El Caballero Oscuro',
        'Breaking Bad',
        'Juego de Tronos',
        'Stranger Things',
        'The Crown',
        'Friends',
        'The Big Bang Theory',
        'Sherlock',
        'Vikingos',
        'Westworld',
        'Black Mirror',
        'Anatomía de Grey',
        'The Office',
        'House',
        'Perdidos',
        'Sobrenatural',
        'Chernobyl',
        'Mad Men'
    ],
    it: [
        'Trova un film con una richiesta!',
        'Le ali della libertà',
        'Forrest Gump',
        'Pulp Fiction',
        'Il miglio verde',
        'Il Signore degli Anelli: La Compagnia dell\'Anello',
        'Harry Potter e la pietra filosofale',
        'Titanic',
        'Terminator',
        'Alien',
        'Avatar',
        'Pirati dei Caraibi',
        'The Avengers',
        'Joker',
        'Parasite',
        'Inception',
        'Matrix',
        'Interstellar',
        'Il Cavaliere Oscuro',
        'Breaking Bad',
        'Il Trono di Spade',
        'Stranger Things',
        'The Crown',
        'Friends',
        'The Big Bang Theory',
        'Sherlock',
        'Vichinghi',
        'Westworld',
        'Black Mirror',
        'Grey\'s Anatomy',
        'The Office',
        'Dr. House',
        'Lost',
        'Supernatural',
        'Chernobyl',
        'Mad Men'
    ],
    pt: [
        'Encontre um filme em uma consulta!',
        'Um Sonho de Liberdade',
        'Forrest Gump',
        'Pulp Fiction',
        'À Espera de um Milagre',
        'O Senhor dos Anéis: A Sociedade do Anel',
        'Harry Potter e a Pedra Filosofal',
        'Titanic',
        'O Exterminador do Futuro',
        'Alien',
        'Avatar',
        'Piratas do Caribe',
        'Os Vingadores',
        'Coringa',
        'Parasita',
        'A Origem',
        'Matrix',
        'Interestelar',
        'O Cavaleiro das Trevas',
        'Breaking Bad',
        'Game of Thrones',
        'Stranger Things',
        'The Crown',
        'Friends',
        'The Big Bang Theory',
        'Sherlock',
        'Vikings',
        'Westworld',
        'Black Mirror',
        'Grey\'s Anatomy',
        'The Office',
        'House',
        'Lost',
        'Sobrenatural',
        'Chernobyl',
        'Mad Men'
    ],
    pl: [
        'Znajdź film jednym zapytaniem!',
        'Skazani na Shawshank',
        'Forrest Gump',
        'Pulp Fiction',
        'Zielona Mila',
        'Władca Pierścieni: Drużyna Pierścienia',
        'Harry Potter i Kamień Filozoficzny',
        'Titanic',
        'Terminator',
        'Obcy',
        'Avatar',
        'Piraci z Karaibów',
        'Avengers',
        'Joker',
        'Parasite',
        'Incepcja',
        'Matrix',
        'Interstellar',
        'Mroczny Rycerz',
        'Breaking Bad',
        'Gra o Tron',
        'Stranger Things',
        'The Crown',
        'Przyjaciele',
        'Teoria Wielkiego Podrywu',
        'Sherlock',
        'Wikingowie',
        'Westworld',
        'Black Mirror',
        'Chirurdzy',
        'Biuro',
        'Dr House',
        'Zagubieni',
        'Nadnaturalne',
        'Czarnobyl',
        'Mad Men'
    ],
    uk: [
        'Знайдеться фільм одним запитом!',
        'Втеча з Шоушенка',
        'Форрест Гамп',
        'Кримінальне чтиво',
        'Зелена миля',
        'Володар перснів: Братство персня',
        'Гаррі Поттер і філософський камінь',
        'Титанік',
        'Термінатор',
        'Чужий',
        'Аватар',
        'Пірати Карибського моря',
        'Месники',
        'Джокер',
        'Паразити',
        'Початок',
        'Матриця',
        'Інтерстеллар',
        'Темний лицар',
        'Пуститися берега',
        'Гра престолів',
        'Дивні дива',
        'Корона',
        'Друзі',
        'Теорія великого вибуху',
        'Шерлок',
        'Вікінги',
        'Західний світ',
        'Чорне дзеркало',
        'Анатомія пристрасті',
        'Офіс',
        'Доктор Хаус',
        'Загублені',
        'Надприродне',
        'Чорнобиль',
        'Божевільні'
    ],
    ja: [
        '1つのクエリで映画が見つかります!',
        'ショーシャンクの空に',
        'フォレスト・ガンプ',
        'パルプ・フィクション',
        'グリーンマイル',
        'ロード・オブ・ザ・リング',
        'ハリー・ポッターと賢者の石',
        'タイタニック',
        'ターミネーター',
        'エイリアン',
        'アバター',
        'パイレーツ・オブ・カリビアン',
        'アベンジャーズ',
        'ジョーカー',
        'パラサイト',
        'インセプション',
        'マトリックス',
        'インターステラー',
        'ダークナイト',
        'ブレイキング・バッド',
        'ゲーム・オブ・スローンズ',
        'ストレンジャー・シングス',
        'ザ・クラウン',
        'フレンズ',
        'ビッグバン★セオリー',
        'シャーロック',
        'ヴァイキング',
        'ウェストワールド',
        'ブラック・ミラー',
        'グレイズ・アナトミー',
        'ザ・オフィス',
        'Dr.HOUSE',
        'LOST',
        'スーパーナチュラル',
        'チェルノブイリ',
        'マッドメン'
    ],
    ko: [
        '하나의 쿼리로 영화를 찾을 수 있습니다',
        '쇼생크 탈출',
        '포레스트 검프',
        '펄프 픽션',
        '그린 마일',
        '반지의 제왕: 반지 원정대',
        '해리 포터와 마법사의 돌',
        '타이타닉',
        '터미네이터',
        '에이리언',
        '아바타',
        '캐리비안의 해적',
        '어벤져스',
        '조커',
        '기생충',
        '인셉션',
        '매트릭스',
        '인터스텔라',
        '다크 나이트',
        '브레이킹 배드',
        '왕좌의 게임',
        '기묘한 이야기',
        '더 크라운',
        '프렌즈',
        '빅뱅 이론',
        '셜록',
        '바이킹',
        '웨스트월드',
        '블랙 미러',
        '그레이 아나토미',
        '오피스',
        '하우스',
        '로스트',
        '슈퍼내추럴',
        '체르노빌',
        '매드맨'
    ],
    zh: [
        '一个查询即可找到电影!',
        '肖申克的救赎',
        '阿甘正传',
        '低俗小说',
        '绿里奇迹',
        '指环王：护戒使者',
        '哈利·波特与魔法石',
        '泰坦尼克号',
        '终结者',
        '异形',
        '阿凡达',
        '加勒比海盗',
        '复仇者联盟',
        '小丑',
        '寄生虫',
        '盗梦空间',
        '黑客帝国',
        '星际穿越',
        '黑暗骑士',
        '绝命毒师',
        '权力的游戏',
        '怪奇物语',
        '王冠',
        '老友记',
        '生活大爆炸',
        '神探夏洛克',
        '维京传奇',
        '西部世界',
        '黑镜',
        '实习医生格蕾',
        '办公室',
        '豪斯医生',
        '迷失',
        '邪恶力量',
        '切尔诺贝利',
        '广告狂人'
    ]
};

// Переводы для tooltip
const tooltipTranslations = {
    ru: {
        disclaimer: 'Все инструменты, ссылки и функции, предоставляемые ktw, предназначены исключительно для удобства и информационных целей. Сайт не хранит и не распространяет аудио- или видеоматериалы. Любые медиафайлы, воспроизводимые через сайт, размещаются и управляются сторонними ресурсами. Мы не принимаем на себя ответственности за содержание, легальность, качество или доступность такого контента на внешних сайтах. Использование любых материалов, полученных через наш сайт, происходит на ваш страх и риск.',
        accept: 'принято',
        copyright: '2025 все права защищены.'
    },
    en: {
        disclaimer: 'All tools, links and functions provided by ktw are intended solely for convenience and informational purposes. The site does not store or distribute audio or video materials. Any media files played through the site are hosted and managed by third-party resources. We do not assume responsibility for the content, legality, quality or availability of such content on external sites. The use of any materials obtained through our site is at your own risk.',
        accept: 'accepted',
        copyright: '2025 all rights reserved.'
    },
    de: {
        disclaimer: 'Alle von ktw bereitgestellten Tools, Links und Funktionen dienen ausschließlich der Bequemlichkeit und zu Informationszwecken. Die Website speichert oder verteilt keine Audio- oder Videomaterialien. Alle über die Website abgespielten Mediendateien werden von Drittanbietern gehostet und verwaltet. Wir übernehmen keine Verantwortung für den Inhalt, die Legalität, die Qualität oder die Verfügbarkeit solcher Inhalte auf externen Websites. Die Verwendung von Materialien, die über unsere Website erhalten werden, erfolgt auf eigenes Risiko.',
        accept: 'akzeptiert',
        copyright: '2025 alle Rechte vorbehalten.'
    },
    fr: {
        disclaimer: 'Tous les outils, liens et fonctions fournis par ktw sont destinés uniquement à la commodité et à des fins d\'information. Le site ne stocke ni ne distribue de matériel audio ou vidéo. Tous les fichiers multimédias lus via le site sont hébergés et gérés par des ressources tierces. Nous n\'assumons aucune responsabilité concernant le contenu, la légalité, la qualité ou la disponibilité de ce contenu sur les sites externes. L\'utilisation de tout matériel obtenu via notre site se fait à vos risques et périls.',
        accept: 'accepté',
        copyright: '2025 tous droits réservés.'
    },
    es: {
        disclaimer: 'Todas las herramientas, enlaces y funciones proporcionadas por ktw están destinadas únicamente para conveniencia y fines informativos. El sitio no almacena ni distribuye materiales de audio o video. Cualquier archivo multimedia reproducido a través del sitio está alojado y gestionado por recursos de terceros. No asumimos responsabilidad por el contenido, la legalidad, la calidad o la disponibilidad de dicho contenido en sitios externos. El uso de cualquier material obtenido a través de nuestro sitio es bajo su propio riesgo.',
        accept: 'aceptado',
        copyright: '2025 todos los derechos reservados.'
    },
    it: {
        disclaimer: 'Tutti gli strumenti, i collegamenti e le funzioni forniti da ktw sono destinati esclusivamente alla comodità e a scopi informativi. Il sito non memorizza né distribuisce materiali audio o video. Eventuali file multimediali riprodotti tramite il sito sono ospitati e gestiti da risorse di terze parti. Non ci assumiamo la responsabilità del contenuto, della legalità, della qualità o della disponibilità di tale contenuto su siti esterni. L\'uso di eventuali materiali ottenuti tramite il nostro sito è a proprio rischio.',
        accept: 'accettato',
        copyright: '2025 tutti i diritti riservati.'
    },
    pt: {
        disclaimer: 'Todas as ferramentas, links e funções fornecidos pelo ktw destinam-se exclusivamente à conveniência e fins informativos. O site não armazena nem distribui materiais de áudio ou vídeo. Quaisquer arquivos de mídia reproduzidos através do site são hospedados e gerenciados por recursos de terceiros. Não assumimos responsabilidade pelo conteúdo, legalidade, qualidade ou disponibilidade de tal conteúdo em sites externos. O uso de qualquer material obtido através do nosso site é por sua conta e risco.',
        accept: 'aceito',
        copyright: '2025 todos os direitos reservados.'
    },
    pl: {
        disclaimer: 'Wszystkie narzędzia, linki i funkcje zapewniane przez ktw przeznaczone są wyłącznie do celów wygody i informacyjnych. Strona nie przechowuje ani nie rozpowszechnia materiałów audio lub wideo. Wszelkie pliki multimedialne odtwarzane za pośrednictwem strony są hostowane i zarządzane przez zasoby stron trzecich. Nie ponosimy odpowiedzialności za treść, legalność, jakość lub dostępność takiej treści na zewnętrznych stronach. Korzystanie z jakichkolwiek materiałów uzyskanych za pośrednictwem naszej strony odbywa się na własne ryzyko.',
        accept: 'zaakceptowano',
        copyright: '2025 wszystkie prawa zastrzeżone.'
    },
    uk: {
        disclaimer: 'Всі інструменти, посилання та функції, надані ktw, призначені виключно для зручності та інформаційних цілей. Сайт не зберігає та не поширює аудіо- або відеоматеріали. Будь-які медіафайли, що відтворюються через сайт, розміщуються та керуються сторонніми ресурсами. Ми не беремо на себе відповідальності за зміст, законність, якість або доступність такого контенту на зовнішніх сайтах. Використання будь-яких матеріалів, отриманих через наш сайт, відбувається на ваш страх і ризик.',
        accept: 'прийнято',
        copyright: '2025 всі права захищені.'
    },
    ja: {
        disclaimer: 'ktwが提供するすべてのツール、リンク、機能は、便宜と情報提供の目的のみを目的としています。サイトはオーディオまたはビデオ素材を保存または配布しません。サイトを通じて再生されるメディアファイルは、サードパーティのリソースによってホストおよび管理されています。外部サイトでのこのようなコンテンツの内容、合法性、品質、または可用性について責任を負いません。当サイトを通じて取得した資料の使用は、自己責任で行われます。',
        accept: '受け入れました',
        copyright: '2025 全著作権所有。'
    },
    ko: {
        disclaimer: 'ktw가 제공하는 모든 도구, 링크 및 기능은 편의 및 정보 제공 목적으로만 사용됩니다. 사이트는 오디오 또는 비디오 자료를 저장하거나 배포하지 않습니다. 사이트를 통해 재생되는 모든 미디어 파일은 타사 리소스에서 호스팅 및 관리됩니다. 외부 사이트에서 이러한 콘텐츠의 내용, 합법성, 품질 또는 가용성에 대해 책임을 지지 않습니다. 당사 사이트를 통해 얻은 자료 사용은 귀하의 위험 부담입니다.',
        accept: '수락됨',
        copyright: '2025 모든 권리 보유.'
    },
    zh: {
        disclaimer: 'ktw提供的所有工具、链接和功能仅用于便利和信息目的。该网站不存储或分发音频或视频材料。通过该网站播放的任何媒体文件都由第三方资源托管和管理。我们不对外部网站上此类内容的内容、合法性、质量或可用性承担责任。通过我们的网站获得的任何材料的使用均由您自行承担风险。',
        accept: '已接受',
        copyright: '2025 版权所有。'
    }
};

// Получаем фразы для текущего языка
let phrases = phrasesTranslations[currentLanguage] || phrasesTranslations['en'];

let currentPhraseIndex = 0;
let currentCharIndex = 0;
let isTyping = false;
let isDeleting = false;
let searchTextElement = null;
let searchTextBackgroundElement = null;
let cursorElement = null;
let idleTimer = null;
let isEditingMode = false;
let backgroundAnimationRunning = false;

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    // Ждем инициализации языка из script-lang.js
    // Если язык еще не определен, используем автоопределение
    if (typeof currentLanguage === 'undefined' || !currentLanguage) {
        const userLanguage = navigator.language || navigator.userLanguage;
        const langCode = userLanguage.split('-')[0].toLowerCase();
        const supportedLanguages = ['ru', 'en', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'uk', 'ja', 'ko', 'zh'];
        currentLanguage = supportedLanguages.includes(langCode) ? langCode : 'en';
    }
    
    searchTextElement = document.getElementById('searchText');
    searchTextBackgroundElement = document.getElementById('searchTextBackground');
    cursorElement = document.getElementById('cursor');
    
    // Инициализация tooltip
    initTooltip();
    
    // Инициализация анимации логотипа для новых пользователей
    initLogoShake();
    
    // Загрузка статистики GitHub
    loadGitHubStats();
    
    // Загрузка статистики посещений
    loadVisitStats();
    
    // Начинаем печатать первую фразу
    setTimeout(() => {
        typePhrase();
    }, 500);
    
    // Обработчик клика на тексте
    searchTextElement.addEventListener('click', handleTextClick);
    
    // Обработчик потери фокуса на редактируемом тексте
    searchTextElement.addEventListener('blur', handleTextBlur);
    
    // Скрываем кастомный курсор при редактировании (браузер покажет свой)
    searchTextElement.addEventListener('focus', () => {
        if (searchTextElement.contentEditable === 'true') {
            cursorElement.classList.add('hidden');
            // Сбрасываем таймер при фокусе
            startIdleTimer();
        }
    });
    
    // Обработчик ввода текста - мгновенная реакция
    searchTextElement.addEventListener('input', handleInput, false);
    searchTextElement.addEventListener('keydown', handleKeyDown, false);
    searchTextElement.addEventListener('keyup', handleKeyUp, false);
    
    // Обработчик нажатий клавиш глобально - если пользователь начинает печатать
    document.addEventListener('keydown', handleGlobalKeyDown);
});

// Функция печатания текста
function typePhrase() {
    // Не печатаем, если в режиме редактирования
    if (isEditingMode || isTyping || isDeleting) return;
    
    const phrase = phrases[currentPhraseIndex];
    isTyping = true;
    backgroundAnimationRunning = true;
    cursorElement.classList.remove('hidden');
    
    // Печатаем посимвольно
    function typeChar() {
        if (currentCharIndex < phrase.length) {
            const text = phrase.substring(0, currentCharIndex + 1);
            
            // Обновляем основной текст только если не в режиме редактирования
            if (!isEditingMode) {
                searchTextElement.textContent = text;
            }
            
            // Всегда обновляем фоновый текст для продолжения анимации
            searchTextBackgroundElement.textContent = text;
            
            currentCharIndex++;
            
            // Случайная скорость для более естественного эффекта
            const speed = 80 + Math.random() * 40;
            setTimeout(typeChar, speed);
        } else {
            isTyping = false;
            // Ждем немного и начинаем удалять только если не в режиме редактирования
            if (!isEditingMode) {
                setTimeout(() => {
                    if (!isEditingMode && backgroundAnimationRunning) {
                        deletePhrase();
                    }
                }, 2500);
            } else {
                // Если в режиме редактирования, продолжаем анимацию в фоне
                setTimeout(() => {
                    if (backgroundAnimationRunning && isEditingMode) {
                        deletePhrase();
                    }
                }, 2500);
            }
        }
    }
    
    typeChar();
}

// Функция удаления текста
function deletePhrase() {
    if (isTyping || isDeleting) return;
    
    const phrase = phrases[currentPhraseIndex];
    isDeleting = true;
    
    function deleteChar() {
        if (currentCharIndex > 0) {
            currentCharIndex--;
            const text = phrase.substring(0, currentCharIndex);
            
            // Обновляем основной текст только если не в режиме редактирования
            if (!isEditingMode) {
                searchTextElement.textContent = text;
            }
            
            // Всегда обновляем фоновый текст для продолжения анимации
            searchTextBackgroundElement.textContent = text;
            
            // Случайная скорость удаления (быстрее чем печатание)
            const speed = 30 + Math.random() * 30;
            setTimeout(deleteChar, speed);
        } else {
            isDeleting = false;
            // Переходим к случайной фразе (первая фраза показывается только при запуске)
            if (currentPhraseIndex === 0) {
                // После первой фразы выбираем случайную из остальных (от 1 до конца)
                currentPhraseIndex = Math.floor(Math.random() * (phrases.length - 1)) + 1;
            } else {
                // Выбираем случайную фразу из всех кроме текущей и первой (индекс 0)
                let newIndex;
                do {
                    newIndex = Math.floor(Math.random() * (phrases.length - 1)) + 1;
                } while (newIndex === currentPhraseIndex);
                currentPhraseIndex = newIndex;
            }
            setTimeout(() => {
                if (backgroundAnimationRunning) {
                    typePhrase();
                }
            }, 800);
        }
    }
    
    deleteChar();
}

// Обработчик клика на тексте
function handleTextClick() {
    // Если уже в режиме редактирования, ничего не делаем
    if (isEditingMode || searchTextElement.contentEditable === 'true') {
        return;
    }
    
    // Останавливаем анимацию и переходим в режим редактирования
    isEditingMode = true;
    isTyping = true;
    isDeleting = true;
    
    // Очищаем таймер, если он был
    if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
    }
    
    const currentText = searchTextElement.textContent;
    const textLength = currentText.length;
    currentCharIndex = textLength;
    
    // Стираем текст полностью назад
    function eraseAllText() {
        if (currentCharIndex > 0) {
            currentCharIndex--;
            searchTextElement.textContent = currentText.substring(0, currentCharIndex);
            setTimeout(eraseAllText, 40);
        } else {
            // После стирания делаем элемент редактируемым
            searchTextElement.textContent = '';
            searchTextElement.contentEditable = 'true';
            cursorElement.classList.add('hidden'); // Скрываем кастомный курсор, браузер покажет свой
            searchTextElement.focus();
            
            // Запускаем таймер на 5 секунд
            startIdleTimer();
        }
    }
    
    eraseAllText();
}

// Таймер простоя (5 секунд без ввода)
function startIdleTimer() {
    // Очищаем предыдущий таймер
    if (idleTimer) {
        clearTimeout(idleTimer);
    }
    
    idleTimer = setTimeout(() => {
        // Проверяем, что поле пустое и мы все еще в режиме редактирования
        if (searchTextElement.contentEditable === 'true' && searchTextElement.textContent.trim() === '') {
            // Убираем фокус и возвращаем анимацию
            searchTextElement.blur();
            resetToAnimationMode();
        }
    }, 500);
}

// Сброс в режим анимации
function resetToAnimationMode() {
    isEditingMode = false;
    searchTextElement.contentEditable = 'false';
    searchTextElement.textContent = '';
    searchTextBackgroundElement.textContent = '';
    currentCharIndex = 0;
    isTyping = false;
    isDeleting = false;
    backgroundAnimationRunning = false;
    cursorElement.classList.remove('hidden');
    
    if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
    }
    
    setTimeout(() => {
        backgroundAnimationRunning = true;
        typePhrase();
    }, 300);
}

// Обработчик ввода текста - мгновенная реакция
function handleInput(e) {
    if (searchTextElement.contentEditable === 'true') {
        // Сбрасываем таймер при каждом вводе
        startIdleTimer();
    }
}

// Обработчик нажатия клавиш - для мгновенной реакции
function handleKeyDown(e) {
    if (searchTextElement.contentEditable === 'true') {
        // Сбрасываем таймер при нажатии любой клавиши
        startIdleTimer();
        
        // Предотвращаем Enter
        if (e.key === 'Enter') {
            e.preventDefault();
        }
    }
}

// Глобальный обработчик нажатий клавиш - для быстрого перехода в режим редактирования
function handleGlobalKeyDown(e) {
    // Если уже в режиме редактирования, не обрабатываем
    if (searchTextElement.contentEditable === 'true') {
        return;
    }
    
    // Проверяем, что это печатный символ (не служебные клавиши)
    const isPrintableKey = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
    
    if (isPrintableKey && !isEditingMode) {
        // Переходим в режим редактирования, но продолжаем анимацию в фоне
        e.preventDefault();
        
        // Включаем режим редактирования, но не останавливаем фоновую анимацию
        isEditingMode = true;
        
        // Очищаем таймеры
        if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }
        
        // Постепенно стираем текст пользователя (не фоновый)
        const currentText = searchTextElement.textContent;
        let eraseIndex = currentText.length;
        
        // Постепенное стирание текста
        function gradualErase() {
            if (eraseIndex > 0) {
                eraseIndex--;
                searchTextElement.textContent = currentText.substring(0, eraseIndex);
                setTimeout(gradualErase, 30); // Постепенное стирание
            } else {
                // После стирания делаем элемент редактируемым и вводим символ
                searchTextElement.textContent = '';
                searchTextElement.contentEditable = 'true';
                cursorElement.classList.add('hidden');
                searchTextElement.focus();
                
                // Вставляем нажатую клавишу
                searchTextElement.textContent = e.key;
                
                // Устанавливаем курсор в конец
                setTimeout(() => {
                    const range = document.createRange();
                    const sel = window.getSelection();
                    range.selectNodeContents(searchTextElement);
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }, 0);
                
                // Запускаем таймер
                startIdleTimer();
            }
        }
        
        gradualErase();
    }
}

// Обработчик отпускания клавиш
function handleKeyUp(e) {
    if (searchTextElement.contentEditable === 'true') {
        // Сбрасываем таймер
        startIdleTimer();
    }
}

// Обработчик потери фокуса на редактируемом тексте
function handleTextBlur() {
    if (searchTextElement.contentEditable === 'true') {
        const userText = searchTextElement.textContent.trim();
        
        // Очищаем таймер
        if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }
        
        if (userText === '') {
            // Если поле пустое, возвращаем анимацию
            resetToAnimationMode();
        } else {
            // Если есть текст, просто выходим из режима редактирования, но оставляем текст
            isEditingMode = false;
            searchTextElement.contentEditable = 'false';
            cursorElement.classList.remove('hidden');
        }
    }
}

// Инициализация tooltip
function initTooltip() {
    const translations = tooltipTranslations[currentLanguage] || tooltipTranslations['en'];
    
    document.getElementById('disclaimerText').textContent = translations.disclaimer;
}

// Инициализация анимации шатания логотипа для новых пользователей
function initLogoShake() {
    const logoTop = document.getElementById('logoTop');
    const logoTooltip = document.getElementById('logoTooltip');
    let hoverTimeout = null;
    let isHovering = false;
    
    // Проверяем, является ли это первым визитом
    const isFirstVisit = !localStorage.getItem('ktw_disclaimer_viewed');
    
    if (isFirstVisit) {
        // Добавляем класс с анимацией шатания
        logoTop.classList.add('shake');
    }
    
    // Функция показа tooltip
    function showTooltip() {
        if (hoverTimeout) {
            clearTimeout(hoverTimeout);
            hoverTimeout = null;
        }
        isHovering = true;
        logoTooltip.style.opacity = '1';
        logoTooltip.style.visibility = 'visible';
        logoTooltip.style.transform = 'translateX(-50%) translateY(0)';
        logoTooltip.style.pointerEvents = 'auto';
    }
    
    // Функция скрытия tooltip
    function hideTooltip() {
        if (hoverTimeout) {
            clearTimeout(hoverTimeout);
        }
        hoverTimeout = setTimeout(() => {
            if (!isHovering) {
                logoTooltip.style.opacity = '0';
                logoTooltip.style.visibility = 'hidden';
                logoTooltip.style.transform = 'translateX(-50%) translateY(-10px)';
                logoTooltip.style.pointerEvents = 'none';
            }
        }, 100); // Небольшая задержка для плавного перехода
    }
    
    // Обработчики для логотипа
    logoTop.addEventListener('mouseenter', function() {
        // Убираем анимацию шатания
        logoTop.classList.remove('shake');
        
        // Сохраняем в localStorage, что пользователь навел (ознакомился с дисплеймером)
        localStorage.setItem('ktw_disclaimer_viewed', 'true');
        
        showTooltip();
    });
    
    logoTop.addEventListener('mouseleave', function() {
        isHovering = false;
        hideTooltip();
    });
    
    // Обработчики для tooltip
    logoTooltip.addEventListener('mouseenter', function() {
        isHovering = true;
        showTooltip();
    });
    
    logoTooltip.addEventListener('mouseleave', function() {
        isHovering = false;
        hideTooltip();
    });
}

// Загрузка статистики GitHub
async function loadGitHubStats() {
    let stars = 0;
    let forks = 0;
    
    try {
        const response = await fetch('https://api.github.com/repos/KinoTeka-watch/KinoTeka-watch');
        if (response.ok) {
            const data = await response.json();
            stars = data.stargazers_count || 0;
            forks = data.forks_count || 0;
        }
    } catch (error) {
        console.error('Error loading GitHub stats:', error);
    }
    
    // Обновляем мини-статистику
    document.getElementById('miniStarsValue').textContent = formatNumber(stars);
    document.getElementById('miniForksValue').textContent = formatNumber(forks);
}

// Загрузка статистики посещений
function loadVisitStats() {
    // Используем localStorage для хранения посещений
    let visits = localStorage.getItem('ktw_visits');
    if (!visits) {
        visits = 0;
    } else {
        visits = parseInt(visits);
    }
    
    // Проверяем, не было ли уже посещения сегодня
    const lastVisit = localStorage.getItem('ktw_last_visit');
    const today = new Date().toDateString();
    
    if (lastVisit !== today) {
        visits++;
        localStorage.setItem('ktw_visits', visits.toString());
        localStorage.setItem('ktw_last_visit', today);
    }
    
    // Обновляем мини-статистику
    document.getElementById('miniVisitsValue').textContent = formatNumber(visits);
}

// Форматирование чисел
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

