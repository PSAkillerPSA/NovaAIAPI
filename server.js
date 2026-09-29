const http = require("http");

const PORT = process.env.PORT || 3000;

const OR_KEY = process.env.OR_KEY;
const HF_KEY = process.env.HF_KEY;

async function askOpenRouter(prompt) {
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

    const data = JSON.parse(text);

    return data?.choices?.[0]?.message?.content ??
        "No response";
}

async function askHF(prompt) {
    const response = await fetch(
        "https://api-inference.huggingface.co/models/google/gemma-2-2b-it",
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${HF_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                inputs: prompt
            })
        }
    );

    const text = await response.text();

    if (!response.ok) {
        throw new Error(
            `HF ${response.status}: ${text}`
        );
    }

    const data = JSON.parse(text);

    if (
        Array.isArray(data) &&
        data[0]?.generated_text
    ) {
        return data[0].generated_text;
    }

    return JSON.stringify(data);
}

const server = http.createServer(async (req, res) => {
    if (req.method !== "GET") {
        res.writeHead(405);
        return res.end(
            "Only GET requests allowed"
        );
    }

    let prompt;

    try {
        prompt = decodeURIComponent(
            req.url.split("?")[0].slice(1)
        );
    } catch {
        res.writeHead(400);
        return res.end(
            "Invalid URL encoding"
        );
    }

    if (!prompt.trim()) {
        res.writeHead(400);
        return res.end(
            "Use /your-prompt-here"
        );
    }

    try {
        let answer;

        try {
            console.log(
                "Trying OpenRouter..."
            );

            answer = await askOpenRouter(
                prompt
            );
        } catch (orError) {
            console.error(
                "OpenRouter failed:",
                orError.message
            );

            console.log(
                "Trying Hugging Face..."
            );

            answer = await askHF(prompt);
        }

        res.writeHead(200, {
            "Content-Type":
                "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin":
                "*"
        });

        res.end(answer);

    } catch (error) {
        console.error(error);

        res.writeHead(500, {
            "Content-Type":
                "application/json"
        });

        res.end(JSON.stringify({
            error: "All providers failed",
            details: error.message
        }));
    }
});

server.listen(PORT, () => {
    console.log(
        `AI proxy running on port ${PORT}`
    );
});
