const http = require("http");

const PORT = process.env.PORT || 3000;

// ============================================================
// API KEYS
// ============================================================

// Keep this as your OpenRouter API key
const OR_KEY = process.env.OR_KEY;

// Google Gemini API key
// Get one from Google AI Studio:
// https://aistudio.google.com/apikey
const GEMINI_KEY = process.env.GEMINI_KEY;

// ============================================================
// CONFIG
// ============================================================

const OPENROUTER_MODEL = "openrouter/free";
const GEMINI_MODEL = "gemini-2.5-flash-lite";

const REQUEST_TIMEOUT = 15000;

// ============================================================
// HELPER: FETCH WITH TIMEOUT
// ============================================================

async function fetchWithTimeout(url, options = {}, timeout = REQUEST_TIMEOUT) {
    const controller = new AbortController();

    const timer = setTimeout(() => {
        controller.abort();
    }, timeout);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timer);
    }
}

// ============================================================
// OPENROUTER
// ============================================================

async function askOpenRouter(prompt) {
    if (!OR_KEY) {
        throw new Error("OR_KEY is not configured");
    }

    const response = await fetchWithTimeout(
        "https://openrouter.ai/api/v1/chat/completions",
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OR_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/PSAkillerPSA/NovaAIAPI",
                "X-Title": "NovaAIAPI"
            },
            body: JSON.stringify({
                // OpenRouter's own free router automatically selects
                // an available free model.
                model: OPENROUTER_MODEL,

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

    const answer = data?.choices?.[0]?.message?.content;

    if (!answer || typeof answer !== "string") {
        throw new Error(
            `OpenRouter returned no answer: ${text}`
        );
    }

    return answer.trim();
}

// ============================================================
// GOOGLE GEMINI FALLBACK
// ============================================================

async function askGemini(prompt) {
    if (!GEMINI_KEY) {
        throw new Error("GEMINI_KEY is not configured");
    }

    const url =
        `https://generativelanguage.googleapis.com/v1beta/models/` +
        `${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;

    const response = await fetchWithTimeout(
        url,
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: prompt
                            }
                        ]
                    }
                ],

                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1024
                }
            })
        }
    );

    const text = await response.text();

    if (!response.ok) {
        throw new Error(
            `Gemini ${response.status}: ${text}`
        );
    }

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(
            `Gemini returned invalid JSON: ${text}`
        );
    }

    const answer =
        data?.candidates?.[0]?.content?.parts
            ?.map(part => part?.text || "")
            .join("")
            .trim();

    if (!answer) {
        throw new Error(
            `Gemini returned no answer: ${text}`
        );
    }

    return answer;
}

// ============================================================
// HTTP SERVER
// ============================================================

const server = http.createServer(async (req, res) => {

    // --------------------------------------------------------
    // CORS
    // --------------------------------------------------------

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, OPTIONS"
    );
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    // --------------------------------------------------------
    // OPTIONS
    // --------------------------------------------------------

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
    }

    // --------------------------------------------------------
    // GET ONLY
    // --------------------------------------------------------

    if (req.method !== "GET") {
        res.writeHead(405, {
            "Content-Type": "text/plain; charset=utf-8"
        });

        return res.end("Only GET requests allowed");
    }

    // --------------------------------------------------------
    // EXTRACT PROMPT
    // --------------------------------------------------------

    let prompt;

    try {
        // URL.pathname is safer than manually splitting req.url.
        const pathname = new URL(
            req.url,
            `http://${req.headers.host || "localhost"}`
        ).pathname;

        prompt = decodeURIComponent(
            pathname.replace(/^\/+/, "")
        );
    } catch {
        res.writeHead(400, {
            "Content-Type": "text/plain; charset=utf-8"
        });

        return res.end("Invalid URL encoding");
    }

    if (!prompt.trim()) {
        res.writeHead(400, {
            "Content-Type": "text/plain; charset=utf-8"
        });

        return res.end("Use /your-prompt-here");
    }

    console.log(`[REQUEST] ${prompt}`);

    // --------------------------------------------------------
    // TRY OPENROUTER FIRST
    // --------------------------------------------------------

    if (OR_KEY) {
        try {
            console.log("[AI] Trying OpenRouter...");

            const answer = await askOpenRouter(prompt);

            console.log("[AI] OpenRouter succeeded.");

            res.writeHead(200, {
                "Content-Type": "text/plain; charset=utf-8"
            });

            return res.end(answer);

        } catch (error) {
            console.error(
                "[AI] OpenRouter failed:",
                error.message
            );
        }
    } else {
        console.log(
            "[AI] OR_KEY is not configured. Skipping OpenRouter."
        );
    }

    // --------------------------------------------------------
    // TRY GEMINI FALLBACK
    // --------------------------------------------------------

    if (GEMINI_KEY) {
        try {
            console.log("[AI] Trying Gemini fallback...");

            const answer = await askGemini(prompt);

            console.log("[AI] Gemini succeeded.");

            res.writeHead(200, {
                "Content-Type": "text/plain; charset=utf-8"
            });

            return res.end(answer);

        } catch (error) {
            console.error(
                "[AI] Gemini failed:",
                error.message
            );
        }
    } else {
        console.log(
            "[AI] GEMINI_KEY is not configured. Skipping Gemini."
        );
    }

    // --------------------------------------------------------
    // ALL PROVIDERS FAILED
    // --------------------------------------------------------

    res.writeHead(503, {
        "Content-Type": "application/json; charset=utf-8"
    });

    return res.end(
        JSON.stringify({
            error: "All AI providers failed",
            providers: {
                openrouter: Boolean(OR_KEY),
                gemini: Boolean(GEMINI_KEY)
            }
        })
    );
});

// ============================================================
// START SERVER
// ============================================================

server.listen(PORT, () => {
    console.log("");
    console.log("==========================================");
    console.log(`AI proxy running on port ${PORT}`);
    console.log("==========================================");
    console.log(
        `OpenRouter: ${OR_KEY ? "configured" : "NOT configured"}`
    );
    console.log(
        `Gemini:     ${GEMINI_KEY ? "configured" : "NOT configured"}`
    );
    console.log("");
    console.log("Fallback order:");
    console.log("1. OpenRouter");
    console.log("2. Google Gemini");
    console.log("==========================================");
});
