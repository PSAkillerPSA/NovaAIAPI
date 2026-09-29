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
                Authorization: `Bearer ${OR_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "deepseek/deepseek-chat:free",
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ]
            })
        }
    );

    if (!response.ok) {
        throw new Error(`OpenRouter ${response.status}`);
    }

    const data = await response.json();

    return data.choices[0].message.content;
}

async function askHF(prompt) {
    const response = await fetch(
        "https://api-inference.huggingface.co/models/microsoft/Phi-3-mini-4k-instruct",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${HF_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                inputs: prompt
            })
        }
    );

    if (!response.ok) {
        throw new Error(`HF ${response.status}`);
    }

    const data = await response.json();

    if (Array.isArray(data) && data[0]?.generated_text) {
        return data[0].generated_text;
    }

    return JSON.stringify(data);
}

const server = http.createServer(async (req, res) => {
    if (req.method !== "GET") {
        return res.end("Only GET requests allowed");
    }

    const prompt = decodeURIComponent(
        req.url.slice(1)
    ).trim();

    if (!prompt) {
        return res.end(
            "Use /your-prompt-here"
        );
    }

    try {
        let answer;

        try {
            console.log(
                "Using OpenRouter..."
            );

            answer = await askOpenRouter(
                prompt
            );
        } catch (e) {
            console.log(
                "OpenRouter failed:",
                e.message
            );

            console.log(
                "Using Hugging Face..."
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
    } catch (err) {
        res.writeHead(500, {
            "Content-Type":
                "application/json"
        });

        res.end(
            JSON.stringify({
                error:
                    "All providers failed",
                details: err.message
            })
        );
    }
});

server.listen(PORT, () => {
    console.log(
        `AI proxy running on port ${PORT}`
    );
});
