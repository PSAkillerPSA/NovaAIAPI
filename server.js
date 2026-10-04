const http = require("http");

const PORT = process.env.PORT || 3000;

// ============================================================
// API KEYS
// ============================================================

const OR_KEY = process.env.OR_KEY;

// ============================================================
// OPENROUTER
// ============================================================

async function askOpenRouter(prompt) {
    if (!OR_KEY) {
        throw new Error("OR_KEY is not configured");
    }

    const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OR_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/PSAkillerPSA/NovaAIAPI"
            },
            body: JSON.stringify({
                model: "inclusionai/ling-3.0-flash-sante:free",
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 1024
            })
        }
    );

    const text = await response.text();

    if (!response.ok) {
        throw new Error(
            `OpenRouter ${response.status}: ${text}`
        );
    }

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(
            `OpenRouter returned invalid JSON: ${text}`
        );
    }

    const answer =
        data?.choices?.[0]?.message?.content;

    if (!answer) {
        throw new Error(
            `OpenRouter returned no answer: ${text}`
        );
    }

    return answer;
}

// ============================================================
// BLOCKRUN AI (FREE, NO AUTH REQUIRED)
// ============================================================

async function askBlockRun(prompt) {
    // BlockRun AI: Free unlimited access to 11 LLMs
    // No auth required, no rate limits on free tier
    const response = await fetch(
        "https://api.blockrun.ai/v1/chat/completions",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-oss-120b",
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 1024
            })
        }
    );

    const text = await response.text();

    if (!response.ok) {
        throw new Error(
            `BlockRun ${response.status}: ${text}`
        );
    }

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(
            `BlockRun returned invalid JSON: ${text}`
        );
    }

    const answer =
        data?.choices?.[0]?.message?.content;

    if (!answer) {
        throw new Error(
            `BlockRun returned no answer: ${text}`
        );
    }

    return answer;
}

// ============================================================
// HTTP SERVER
// ============================================================

const server = http.createServer(async (req, res) => {

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    if (req.method === "OPTIONS") {
        res.writeHead(200);
        return res.end();
    }

    // Only GET requests
    if (req.method !== "GET") {
        res.writeHead(405, {
            "Content-Type": "text/plain; charset=utf-8"
        });

        return res.end(
            "Only GET requests allowed"
        );
    }

    // --------------------------------------------------------
    // Extract prompt
    // --------------------------------------------------------

    let prompt;

    try {
        const rawPath =
            req.url.split("?")[0].slice(1);

        prompt = decodeURIComponent(rawPath);

    } catch {
        res.writeHead(400, {
            "Content-Type": "text/plain; charset=utf-8"
        });

        return res.end(
            "Invalid URL encoding"
        );
    }

    if (!prompt.trim()) {
        res.writeHead(400, {
            "Content-Type": "text/plain; charset=utf-8"
        });

        return res.end(
            "Use /your-prompt-here"
        );
    }

    console.log(
        `[REQUEST] ${prompt}`
    );

    // --------------------------------------------------------
    // Try OpenRouter
    // --------------------------------------------------------

    try {

        console.log(
            "[AI] Trying OpenRouter..."
        );

        const answer =
            await askOpenRouter(prompt);

        console.log(
            "[AI] OpenRouter succeeded."
        );

        res.writeHead(200, {
            "Content-Type":
                "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin":
                "*"
        });

        return res.end(answer);

    } catch (orError) {

        console.error(
            "[AI] OpenRouter failed:",
            orError.message
        );
    }

    // --------------------------------------------------------
    // Try BlockRun AI (Fallback)
    // --------------------------------------------------------

    try {

        console.log(
            "[AI] Trying BlockRun AI fallback..."
        );

        const answer =
            await askBlockRun(prompt);

        console.log(
            "[AI] BlockRun AI succeeded."
        );

        res.writeHead(200, {
            "Content-Type":
                "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin":
                "*"
        });

        return res.end(answer);

    } catch (brError) {

        console.error(
            "[AI] BlockRun AI failed:",
            brError.message
        );
    }

    // --------------------------------------------------------
    // All providers failed
    // --------------------------------------------------------

    res.writeHead(503, {
        "Content-Type":
            "application/json",
        "Access-Control-Allow-Origin":
            "*"
    });

    res.end(JSON.stringify({
        error: "All AI providers failed"
    }));
});

// ============================================================
// START SERVER
// ============================================================

server.listen(PORT, () => {
    console.log(
        `AI proxy running on port ${PORT}`
    );

    console.log(
        `OpenRouter: ${OR_KEY ? "configured" : "NOT configured"}`
    );

    console.log(
        `BlockRun AI: available (free unlimited, no auth required)`
    );
});
