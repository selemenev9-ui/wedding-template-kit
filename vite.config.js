import { defineConfig, loadEnv } from 'vite';

/**
 * POST /api/rsvp — reads .env on the server, calls Telegram (no token in browser URL).
 * Works in `vite` and `vite preview`. Static hosting needs a real backend or VITE_RSVP_API_URL.
 */
function attachRsvpMiddleware(server, env) {
    server.middlewares.use((req, res, next) => {
        const pathOnly = req.url?.split('?')[0];
        if (pathOnly !== '/api/rsvp' || req.method !== 'POST') {
            return next();
        }

        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', async () => {
            let body;
            try {
                body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
            } catch {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: false, description: 'Invalid JSON' }));
                return;
            }

            const name = String(body.name || '').trim();
            const attendance = String(body.attendance || '');
            if (!name) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: false, description: 'Name required' }));
                return;
            }

            const token = env.VITE_TG_BOT_TOKEN;
            const chatId = env.VITE_TG_CHAT_ID;
            if (!token || !chatId) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: false, description: 'Missing VITE_TG_* in .env' }));
                return;
            }

            const escapeHtml = (value) =>
                String(value)
                    .replaceAll('&', '&amp;')
                    .replaceAll('<', '&lt;')
                    .replaceAll('>', '&gt;')
                    .replaceAll('"', '&quot;');
            const safeName = escapeHtml(name);
            const statusLabel = attendance === 'Буду' ? '✅ С удовольствием буду' : '❌ К сожалению, не смогу';
            const safeStatus = escapeHtml(statusLabel);
            const sentAt = new Date().toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
            const safeSentAt = escapeHtml(sentAt);
            const source = escapeHtml(req.headers.host || 'local-dev');
            const message =
                `<b>RSVP • Катя & Артём</b>\n` +
                `━━━━━━━━━━━━━━\n` +
                `🕊 <b>Новый ответ на приглашение</b>\n\n` +
                `👤 <b>Гость</b>\n` +
                `${safeName}\n\n` +
                `📌 <b>Статус</b>\n` +
                `${safeStatus}\n\n` +
                `🕒 <b>Время:</b> ${safeSentAt}\n` +
                `🌐 <b>Источник:</b> ${source}`;

            try {
                const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        text: message,
                        parse_mode: 'HTML',
                    }),
                });
                const data = await tgRes.json();
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = tgRes.ok && data.ok ? 200 : 502;
                res.end(JSON.stringify(data));
            } catch (err) {
                res.statusCode = 502;
                res.setHeader('Content-Type', 'application/json');
                res.end(
                    JSON.stringify({
                        ok: false,
                        description: err instanceof Error ? err.message : 'Network error',
                    }),
                );
            }
        });
    });
}

function rsvpTelegramPlugin(env) {
    return {
        name: 'rsvp-telegram',
        configureServer(server) {
            attachRsvpMiddleware(server, env);
        },
        configurePreviewServer(server) {
            attachRsvpMiddleware(server, env);
        },
    };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');

    const telegramDevProxy = {
        target: 'https://api.telegram.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/telegram/, ''),
    };

    return {
        base: '/wedding-template-kit/',
        plugins: [rsvpTelegramPlugin(env)],
        server: {
            proxy: {
                '/api/telegram': telegramDevProxy,
            },
        },
        preview: {
            proxy: {
                '/api/telegram': telegramDevProxy,
            },
        },
    };
});
