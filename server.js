const http = require("http");

const PORT = process.env.PORT || 3000;

// ============================================================
// API KEYS
// ============================================================

const OR_KEY = process.env.OR_KEY;
const HF_KEY = process.env.HF_KEY;

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
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "inclusionai/ling-3.0-flash-sante:free",
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ]
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
// HUGGING FACE BACKUP
// ============================================================

async function askHF(prompt) {
    if (!HF_KEY) {
        throw new Error("HF_KEY is not configured");
    }

    const model =
        "google/gemma-2-2b-it";

    const response = await fetch(
        `https://api-inference.huggingface.co/models/${model}`,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${HF_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                inputs: prompt,
                parameters: {
                    max_new_tokens: 512,
                    return_full_text: false
                },
                options: {
                    wait_for_model: true
                }
            })
        }
    );

    const text = await response.text();

    if (!response.ok) {
        throw new Error(
            `Hugging Face ${response.status}: ${text}`
        );
    }

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(
            `Hugging Face returned invalid JSON: ${text}`
        );
    }

    // Normal text-generation response
    if (
        Array.isArray(data) &&
        data.length > 0 &&
        typeof data[0]?.generated_text === "string"
    ) {
        return data[0].generated_text;
    }

    // Some HF responses can contain generated_text
    // in a slightly different structure.
    if (
        data?.generated_text &&
        typeof data.generated_text === "string"
    ) {
        return data.generated_text;
    }

    // Hugging Face can return an error object even with HTTP 200
    if (data?.error) {
        throw new Error(
            `Hugging Face error: ${data.error}`
        );
    }

    throw new Error(
        `Hugging Face returned an unexpected response: ${text}`
    );
}

// ============================================================
// HTTP SERVER
// ============================================================

const server = http.createServer(async (req, res) => {

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
    // Try Hugging Face
    // --------------------------------------------------------

    try {

        console.log(
            "[AI] Trying Hugging Face backup..."
        );

        const answer =
            await askHF(prompt);

        console.log(
            "[AI] Hugging Face succeeded."
        );

        res.writeHead(200, {
            "Content-Type":
                "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin":
                "*"
        });

        return res.end(answer);

    } catch (hfError) {

        console.error(
            "[AI] Hugging Face failed:",
            hfError.message
        );
    }

    // --------------------------------------------------------
    // Both failed
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
        `Hugging Face: ${HF_KEY ? "configured" : "NOT configured"}`
    );
});
