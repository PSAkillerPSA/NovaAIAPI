const http = require("http");

const PORT = process.env.PORT || 3000;

// ============================================================
// API KEYS
// ============================================================

// ONLY REAL API KEY REQUIRED BY THIS SCRIPT
const OR_KEY = process.env.OR_KEY;

// ============================================================
// CONFIG
// ============================================================

const REQUEST_TIMEOUT = 15000;

// OpenRouter's free router automatically chooses an available
// free model.
const OPENROUTER_MODEL = "openrouter/free";

// LLMFaucet automatically routes across several anonymous
// providers.
const LLMFAUCET_MODEL = "auto";

// Pollinations currently provides anonymous text generation.
// Model availability can change, so we use its generic model.
const POLLINATIONS_MODEL = "openai";

// AI Horde supports anonymous requests using ten zeros as
// the anonymous API key.
const AI_HORDE_ANONYMOUS_KEY = "0000000000";

// ============================================================
// FETCH WITH TIMEOUT
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
// PARSE OPENAI-COMPATIBLE RESPONSE
// ============================================================

async function parseOpenAIResponse(response, provider) {
    const text = await response.text();

    if (!response.ok) {
        throw new Error(
            `${provider} ${response.status}: ${text.slice(0, 1000)}`
        );
    }

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(
            `${provider} returned invalid JSON: ${text.slice(0, 1000)}`
        );
    }

    const answer =
        data?.choices?.[0]?.message?.content;

    if (!answer || typeof answer !== "string") {
        throw new Error(
            `${provider} returned no answer: ${text.slice(0, 1000)}`
        );
    }

    return answer.trim();
}

// ============================================================
// 1. OPENROUTER
// ============================================================

async function askOpenRouter(prompt) {
    if (!OR_KEY) {
        throw new Error("OR_KEY is not configured");
    }

    console.log("[OpenRouter] Trying...");

    const response = await fetchWithTimeout(
        "https://openrouter.ai/api/v1/chat/completions",
        {
            method: "POST",

            headers: {
                "Authorization": `Bearer ${OR_KEY}`,
                "Content-Type": "application/json",

                "HTTP-Referer":
                    "https://github.com/PSAkillerPSA/NovaAIAPI",

                "X-Title": "NovaAIAPI"
            },

            body: JSON.stringify({
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

    return await parseOpenAIResponse(
        response,
        "OpenRouter"
    );
}

// ============================================================
// 2. LLMFAUCET
// ============================================================
//
// LLMFaucet is a public OpenAI-compatible gateway that
// automatically routes among anonymous/keyless sources.
//
// Current documented upstreams include:
// - Pollinations
// - LLM7
// - OpenCode Zen
// - OVH AI Endpoints
// - AI Horde
//
// No real API key is required.
// "free" is merely a placeholder authorization value.
//

async function askLLMFaucet(prompt) {
    console.log("[LLMFaucet] Trying...");

    const response = await fetchWithTimeout(
        "https://api.llmfaucet.dev/v1/chat/completions",
        {
            method: "POST",

            headers: {
                "Authorization": "Bearer free",
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                model: LLMFAUCET_MODEL,

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

    return await parseOpenAIResponse(
        response,
        "LLMFaucet"
    );
}

// ============================================================
// 3. POLLINATIONS DIRECT
// ============================================================
//
// Anonymous / no API key.
// OpenAI-compatible endpoint.
//
// This is intentionally separate from LLMFaucet so that if
// LLMFaucet itself is down, we can still reach Pollinations.
//

async function askPollinations(prompt) {
    console.log("[Pollinations] Trying...");

    const response = await fetchWithTimeout(
        "https://text.pollinations.ai/openai/chat/completions",
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                model: POLLINATIONS_MODEL,

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

    return await parseOpenAIResponse(
        response,
        "Pollinations"
    );
}

// ============================================================
// 4. AI HORDE
// ============================================================
//
// AI Horde is a crowdsourced AI network.
// Anonymous requests are supported with:
//
// 0000000000
//
// Anonymous requests have the lowest queue priority.
//

async function askAIHorde(prompt) {
    console.log("[AI Horde] Submitting...");

    const submitResponse = await fetchWithTimeout(
        "https://aihorde.net/api/v2/generate/text/async",
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "apikey": AI_HORDE_ANONYMOUS_KEY
            },

            body: JSON.stringify({
                prompt,

                params: {
                    max_length: 1024,
                    max_context_length: 4096,
                    temperature: 0.7,
                    n: 1
                },

                models: [],

                trusted_workers: false,

                client_agent:
                    "NovaAIAPI:1.0"
            })
        }
    );

    const submitText = await submitResponse.text();

    if (!submitResponse.ok) {
        throw new Error(
            `AI Horde submit ${submitResponse.status}: ${submitText}`
        );
    }

    let submitted;

    try {
        submitted = JSON.parse(submitText);
    } catch {
        throw new Error(
            `AI Horde returned invalid submit JSON`
        );
    }

    const requestId = submitted?.id;

    if (!requestId) {
        throw new Error(
            `AI Horde did not return a request ID`
        );
    }

    // --------------------------------------------------------
    // Poll for completion
    // --------------------------------------------------------

    const maxAttempts = 8;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {

        await new Promise(resolve =>
            setTimeout(resolve, 1500)
        );

        const statusResponse = await fetchWithTimeout(
            `https://aihorde.net/api/v2/generate/text/status/${requestId}`,
            {
                method: "GET",

                headers: {
                    "apikey": AI_HORDE_ANONYMOUS_KEY
                }
            }
        );

        const statusText =
            await statusResponse.text();

        if (!statusResponse.ok) {
            throw new Error(
                `AI Horde status ${statusResponse.status}: ${statusText}`
            );
        }

        let status;

        try {
            status = JSON.parse(statusText);
        } catch {
            throw new Error(
                "AI Horde returned invalid status JSON"
            );
        }

        // Completed
        if (
            status?.done === true &&
            Array.isArray(status?.generations)
        ) {
            const answer =
                status.generations[0]?.text;

            if (answer) {
                return answer.trim();
            }

            throw new Error(
                "AI Horde completed without generated text"
            );
        }

        // Explicit failure
        if (status?.faulted === true) {
            throw new Error(
                `AI Horde generation faulted: ${statusText}`
            );
        }

        console.log(
            `[AI Horde] Still processing (${attempt + 1}/${maxAttempts})...`
        );
    }

    throw new Error(
        "AI Horde timed out waiting for generation"
    );
}

// ============================================================
// FALLBACK CHAIN
// ============================================================
//
// Only OpenRouter needs a real secret.
//
// Everything after it is keyless.
//
// IMPORTANT:
// We do NOT fire every provider simultaneously.
// We try them sequentially to avoid wasting free quotas.
//

const providers = [
    {
        name: "OpenRouter",
        enabled: () => Boolean(OR_KEY),
        ask: askOpenRouter
    },

    {
        name: "LLMFaucet",
        enabled: () => true,
        ask: askLLMFaucet
    },

    {
        name: "Pollinations",
        enabled: () => true,
        ask: askPollinations
    },

    {
        name: "AI Horde",
        enabled: () => true,
        ask: askAIHorde
    }
];

// ============================================================
// ASK ALL PROVIDERS
// ============================================================

async function askAI(prompt) {

    const errors = [];

    for (const provider of providers) {

        if (!provider.enabled()) {
            console.log(
                `[AI] ${provider.name} disabled`
            );

            continue;
        }

        try {

            console.log(
                `[AI] Trying ${provider.name}...`
            );

            const answer =
                await provider.ask(prompt);

            if (!answer) {
                throw new Error(
                    "Provider returned an empty answer"
                );
            }

            console.log(
                `[AI] ${provider.name} succeeded.`
            );

            return {
                answer,
                provider: provider.name
            };

        } catch (error) {

            const message =
                error?.message || String(error);

            console.error(
                `[AI] ${provider.name} failed: ${message}`
            );

            errors.push({
                provider: provider.name,
                error: message
            });
        }
    }

    const error = new Error(
        "All AI providers failed"
    );

    error.providers = errors;

    throw error;
}

// ============================================================
// HTTP SERVER
// ============================================================

const server = http.createServer(
    async (req, res) => {

        // ----------------------------------------------------
        // CORS
        // ----------------------------------------------------

        res.setHeader(
            "Access-Control-Allow-Origin",
            "*"
        );

        res.setHeader(
            "Access-Control-Allow-Methods",
            "GET, OPTIONS"
        );

        res.setHeader(
            "Access-Control-Allow-Headers",
            "Content-Type"
        );

        // ----------------------------------------------------
        // OPTIONS
        // ----------------------------------------------------

        if (req.method === "OPTIONS") {
            res.writeHead(204);
            return res.end();
        }

        // ----------------------------------------------------
        // GET ONLY
        // ----------------------------------------------------

        if (req.method !== "GET") {

            res.writeHead(405, {
                "Content-Type":
                    "text/plain; charset=utf-8"
            });

            return res.end(
                "Only GET requests allowed"
            );
        }

        // ----------------------------------------------------
        // Extract prompt
        // ----------------------------------------------------

        let prompt;

        try {

            const url = new URL(
                req.url,
                `http://${req.headers.host || "localhost"}`
            );

            prompt = decodeURIComponent(
                url.pathname.replace(/^\/+/, "")
            );

        } catch {

            res.writeHead(400, {
                "Content-Type":
                    "text/plain; charset=utf-8"
            });

            return res.end(
                "Invalid URL encoding"
            );
        }

        if (!prompt.trim()) {

            res.writeHead(400, {
                "Content-Type":
                    "text/plain; charset=utf-8"
            });

            return res.end(
                "Use /your-prompt-here"
            );
        }

        console.log("");
        console.log(
            "=========================================="
        );
        console.log(
            `[REQUEST] ${prompt}`
        );
        console.log(
            "=========================================="
        );

        // ----------------------------------------------------
        // Ask AI
        // ----------------------------------------------------

        try {

            const result =
                await askAI(prompt);

            res.writeHead(200, {
                "Content-Type":
                    "text/plain; charset=utf-8",

                "X-AI-Provider":
                    result.provider
            });

            return res.end(
                result.answer
            );

        } catch (error) {

            console.error(
                "[AI] Everything failed."
            );

            // ------------------------------------------------
            // 503
            // ------------------------------------------------

            res.writeHead(503, {
                "Content-Type":
                    "application/json; charset=utf-8"
            });

            return res.end(
                JSON.stringify({
                    error:
                        "All AI providers failed",

                    providers:
                        error.providers || []
                })
            );
        }
    }
);

// ============================================================
// START
// ============================================================

server.listen(PORT, () => {

    console.log("");
    console.log(
        "=========================================="
    );
    console.log(
        `NovaAIAPI running on port ${PORT}`
    );
    console.log(
        "=========================================="
    );

    console.log(
        `OpenRouter:  ${OR_KEY ? "configured" : "NOT configured"}`
    );

    console.log(
        "LLMFaucet:   enabled (no key)"
    );

    console.log(
        "Pollinations: enabled (no key)"
    );

    console.log(
        "AI Horde:    enabled (anonymous)"
    );

    console.log("");
    console.log(
        "Fallback order:"
    );

    console.log(
        "1. OpenRouter"
    );

    console.log(
        "2. LLMFaucet → multiple anonymous upstreams"
    );

    console.log(
        "3. Pollinations"
    );

    console.log(
        "4. AI Horde"
    );

    console.log("");
});
