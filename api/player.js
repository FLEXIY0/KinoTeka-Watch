export default async function handler(req, res) {
    const { url } = req.query;

    if (!url) {
        return res.status(400).send('No URL provided');
    }

    try {
        // Сервер Vercel притворяется обычным юзером и скачивает HTML плеера
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                // Некоторые балансеры проверяют реферер для защиты
                'Referer': 'https://www.kinopoisk.ru/'
            }
        });

        if (!response.ok) {
            return res.status(response.status).send('Ошибка загрузки плеера');
        }

        let html = await response.text();

        // Удаляем CSP мета-тег, если оригинальный сайт запрещает inline-скрипты/стили
        html = html.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');

        // 1. Устанавливаем <base>, чтобы скрипты плеера (относительные пути) загружались с их родного домена
        const baseUrl = new URL(url).origin;
        html = html.replace('<head>', `<head>\n<base href="${baseUrl}/">`);

        // 2. Внедряем "убийцу рекламы" (CSS для баннеров + JS против кликандеров)
        const adblockInjection = `
            <style>
                /* Скрываем типичные рекламные баннеры и оверлеи */
                [class*="ad_"], [id*="ad_"], [class*="banner"], 
                [class*="teaser"], [id*="teaser"], iframe[src*="ad"] {
                    display: none !important;
                    opacity: 0 !important;
                    pointer-events: none !important;
                }
            </style>
            <script>
                // Полностью запрещаем всплывающие окна при кликах по плееру (кликандеры)
                window.open = function() { 
                    console.log("[KTW Adblock] Popup blocked!"); 
                    return null; 
                };
            </script>
        `;

        html = html.replace('</head>', `${adblockInjection}\n</head>`);

        // Возвращаем чистый плеер вашему пользователю
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.status(200).send(html);

    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error: ' + error.message);
    }
}
