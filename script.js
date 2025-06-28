document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const apiKeyInput = document.getElementById('apiKey');
    const convertBtn = document.getElementById('convertBtn');
    const output = document.getElementById('output');
    const downloadBtn = document.getElementById('downloadBtn');
    const loader = document.getElementById('loader');
    const progressText = document.getElementById('progressText'); // Will be added to index.html

    let textContent = '';
    let finalConvertedText = '';

    const CHUNK_SIZE = 1500; // characters

    const checkInputs = () => {
        convertBtn.disabled = !(fileInput.files.length > 0 && apiKeyInput.value.trim() !== '');
    };

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            textContent = '';
            checkInputs();
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            textContent = e.target.result;
            output.value = 'ファイルが読み込まれました。「AIで変換する」ボタンをクリックしてください。';
            checkInputs();
        };
        reader.readAsText(file, 'UTF-8');
    });

    apiKeyInput.addEventListener('input', checkInputs);

    function chunkText(text, maxChunkSize) {
        // Split the text by paragraphs (one or more blank lines)
        const paragraphs = text.split(/\n\s*\n/);
        const chunks = [];
        let currentChunk = "";

        for (const paragraph of paragraphs) {
            // If the paragraph itself is larger than the max size, it becomes its own chunk.
            if (paragraph.length > maxChunkSize) {
                // If there's a current chunk, push it first.
                if (currentChunk.length > 0) {
                    chunks.push(currentChunk.trim());
                }
                chunks.push(paragraph); // Push the large paragraph as a standalone chunk
                currentChunk = ""; // Reset current chunk
                continue;
            }

            // Check if adding the next paragraph would exceed the max size
            if (currentChunk.length + paragraph.length + 2 > maxChunkSize && currentChunk.length > 0) {
                chunks.push(currentChunk.trim());
                currentChunk = ""; // Start a new chunk
            }

            // Add the paragraph to the current chunk
            if (currentChunk.length > 0) {
                currentChunk += "\n\n" + paragraph;
            } else {
                currentChunk = paragraph;
            }
        }

        // Add the last remaining chunk if it exists
        if (currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
        }

        return chunks;
    }

    async function convertChunk(chunk, apiKey) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                max_tokens: 4000, 
                messages: [
                    {
                        role: 'system',
                        content: `あなたは、プレーンテキストをMarkdownに変換する専門家です。
これは大きなドキュメントの一部であるテキストの断片（チャンク）です。このチャンクのテキストだけを、意味や内容を一切変更せず、構造化された読みやすいMarkdown形式に変換してください。導入や結論、要約は絶対に含めないでください。

以下のルールに従って、見出しを正確に判定してください：
1. **大見出し (#)**: 「第X章」や「Chapter X」のような章題や、主要なセクションのタイトル。
2. **中見出し (##)**: 「X.Y」のような節番号を持つ行や、段落の主題を示す短いフレーズ。
3. **小見出し (###)**: 箇条書きの親項目や、特定のトピックを簡潔に示すキーワード。
4. **共通ルール**: 見出しは通常、文末に句点（。）を持ちません。独立した短い行は、見出しである可能性が高いです。`
                    },
                    {
                        role: 'user',
                        content: chunk
                    }
                ]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`APIエラー (チャンク処理中): ${response.status} - ${errorData.error.message}`);
        }

        const data = await response.json();
        return data.choices[0].message.content.trim();
    }

    convertBtn.addEventListener('click', async () => {
        if (!textContent || !apiKeyInput.value) {
            alert('APIキーを入力し、ファイルをアップロードしてください。');
            return;
        }

        loader.style.display = 'block';
        progressText.style.display = 'block';
        output.value = '';
        finalConvertedText = '';
        convertBtn.disabled = true;
        downloadBtn.disabled = true;

        const chunks = chunkText(textContent, CHUNK_SIZE);
        let processedChunks = 0;

        try {
            for (const chunk of chunks) {
                processedChunks++;
                progressText.textContent = `${processedChunks} / ${chunks.length} 個のチャンクを処理中...`;
                const convertedChunk = await convertChunk(chunk, apiKeyInput.value.trim());
                finalConvertedText += convertedChunk + '\n\n';
                output.value = finalConvertedText;
                // Scroll to the bottom of the textarea
                output.scrollTop = output.scrollHeight;
            }
            progressText.textContent = '変換が完了しました！';
            downloadBtn.disabled = false;

        } catch (error) {
            output.value = `エラーが発生しました: ${error.message}`;
            progressText.textContent = 'エラーが発生しました。';
        } finally {
            loader.style.display = 'none';
            checkInputs();
        }
    });

    downloadBtn.addEventListener('click', () => {
        if (finalConvertedText) {
            const blob = new Blob([finalConvertedText], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'converted-by-ai-large.md';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    });
});
