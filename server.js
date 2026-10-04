const http = require("http");

const PORT = process.env.PORT || 3000;

// ============================================================
// API KEYS
// ============================================================

const OR_KEY = process.env.OR_KEY;
const GROQ_KEY = process.env.GROQ_KEY;

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
// GROQ API
// ============================================================

async function askGroq(prompt) {
    if (!GROQ_KEY) {
        throw new Error("GROQ_KEY is not configured");
    }

    const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "mixtral-8x7b-32768",
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
            `Groq ${response.status}: ${text}`
        );
    }

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(
            `Groq returned invalid JSON: ${text}`
        );
    }

    const answer =
        data?.choices?.[0]?.message?.content;

    if (!answer) {
        throw new Error(
            `Groq returned no answer: ${text}`
        );
    }

    return answer;
}

// ============================================================
// FREE UNLIMITED API (NO AUTH REQUIRED, LAST RESORT)
// ============================================================

async function askFreeAPI(prompt) {
    // Using Ollama local instance or public free endpoint
    // Trying multiple free/unlimited endpoints in order
    
    const endpoints = [
        // 1. Local Ollama (if running)
        {
            url: "http://localhost:11434/api/generate",
            format: "ollama",
            timeout: 5000
        },
        // 2. Inference.chat API (free, no auth)
        {
            url: "https://inference.chat/v1/chat/completions",
            format: "openai",
            timeout: 10000
        },
        // 3. Together AI (free tier, limited but available)
        {
            url: "https://api.together.xyz/v1/chat/completions",
            format: "openai-together",
            timeout: 10000
        }
    ];

    for (const endpoint of endpoints) {
        try {
            console.log(`[FREE API] Trying ${endpoint.url}...`);

            if (endpoint.format === "ollama") {
                const response = await fetchWithTimeout(
                    endpoint.url,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            model: "llama2",
                            prompt: prompt,
                            stream: false
                        })
                    },
                    endpoint.timeout
                );

                const text = await response.text();

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${text}`);
                }

                const data = JSON.parse(text);
                if (data.response && typeof data.response === "string") {
                    return data.response;
                }
            } else if (endpoint.format === "openai") {
                const response = await fetchWithTimeout(
                    endpoint.url,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            model: "gpt-3.5-turbo",
                            messages: [{ role: "user", content: prompt }],
                            max_tokens: 256
                        })
                    },
                    endpoint.timeout
                );

                const text = await response.text();

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${text}`);
                }

                const data = JSON.parse(text);
                if (data?.choices?.[0]?.message?.content) {
                    return data.choices[0].message.content;
                }
            } else if (endpoint.format === "openai-together") {
                const response = await fetchWithTimeout(
                    endpoint.url,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            model: "meta-llama/Llama-2-7b-chat-hf",
                            messages: [{ role: "user", content: prompt }],
                            temperature: 0.7,
                            max_tokens: 256
                        })
                    },
                    endpoint.timeout
                );

                const text = await response.text();

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${text}`);
                }

                const data = JSON.parse(text);
                if (data?.choices?.[0]?.message?.content) {
                    return data.choices[0].message.content;
                }
            }
        } catch (err) {
            console.error(`[FREE API] ${endpoint.url} failed:`, err.message);
            continue; // Try next endpoint
        }
    }

    throw new Error("All free API endpoints exhausted");
}

// ============================================================
// FETCH WITH TIMEOUT HELPER
// ============================================================

function fetchWithTimeout(url, options, timeout = 10000) {
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), timeout)
        )
    ]);
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
    // Try Groq
    // --------------------------------------------------------

    try {

        console.log(
            "[AI] Trying Groq backup..."
        );

        const answer =
            await askGroq(prompt);

        console.log(
            "[AI] Groq succeeded."
        );

        res.writeHead(200, {
            "Content-Type":
                "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin":
                "*"
        });

        return res.end(answer);

    } catch (groqError) {

        console.error(
            "[AI] Groq failed:",
            groqError.message
        );
    }

    // --------------------------------------------------------
    // Try free API last
    // --------------------------------------------------------

    try {

        console.log(
            "[AI] Trying free API fallback..."
        );

        const answer =
            await askFreeAPI(prompt);

        console.log(
            "[AI] Free API succeeded."
        );

        res.writeHead(200, {
            "Content-Type":
                "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin":
                "*"
        });

        return res.end(answer);

    } catch (freeError) {

        console.error(
            "[AI] Free API failed:",
            freeError.message
        );
    }

    // --------------------------------------------------------
    // All failed
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
        `Groq: ${GROQ_KEY ? "configured" : "NOT configured"}`
    );

    console.log(
        `Free API fallback: available (no auth required, multiple endpoints)`
    );
});
