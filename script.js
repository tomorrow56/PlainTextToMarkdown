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

    const CHUNK_SIZE = 3000; // characters

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

        for (let paragraph of paragraphs) {
            // If the paragraph itself is larger than the max size, split it intelligently by lines
            if (paragraph.length > maxChunkSize) {
                // Flush current chunk if any
                if (currentChunk.length > 0) {
                    chunks.push(currentChunk.trim());
                    currentChunk = "";
                }

                const lines = paragraph.split('\n');
                let tempChunk = "";

                for (const line of lines) {
                    // If a single line is too long (rare), split it by char limit
                    if (line.length > maxChunkSize) {
                        if (tempChunk.length > 0) {
                            chunks.push(tempChunk.trim());
                            tempChunk = "";
                        }
                        let remainingLine = line;
                        while (remainingLine.length > 0) {
                            chunks.push(remainingLine.substring(0, maxChunkSize));
                            remainingLine = remainingLine.substring(maxChunkSize);
                        }
                        continue;
                    }

                    if (tempChunk.length + line.length + 1 > maxChunkSize) {
                        chunks.push(tempChunk.trim());
                        tempChunk = line;
                    } else {
                        tempChunk += (tempChunk ? "\n" : "") + line;
                    }
                }
                
                if (tempChunk.length > 0) {
                    currentChunk = tempChunk;
                }
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
                        content: `あなたはプレーンテキストをMarkdownに変換するツールです。
入力されたテキストを、**一文字たりとも削除・省略せず**に、Markdown記法を用いて見やすく整形してください。

### 最重要ルール: 元のテキストを絶対に消さないこと
- 入力にある文章、見出し、表のデータ、アスキーアート、注釈、箇条書きなど、**すべての要素**を出力に残してください。
- AIによる要約、抜粋、省略は**厳禁**です。
- 表や図形を変換する際、その前後にある説明文やタイトルを誤って削除しないように細心の注意を払ってください。

### 整形ルール
1. **見出し**: 文脈に合わせて #, ##, ### を付与。
2. **表**: | ヘッダー | 記法でMarkdownテーブルに変換。コードブロックには入れない。
3. **アスキーアート**: \`\`\`text で囲んで保護。
4. **リスト**: - や 1. を使って整形。

出力はMarkdownテキストのみを行ってください。`
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
        if (!fileInput.files.length || !apiKeyInput.value.trim()) {
            alert('APIキーを入力し、ファイルをアップロードしてください。');
            return;
        }

        if (!textContent) {
            alert('ファイルを読み込んでいます。数秒待ってからもう一度ボタンを押してください。');
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
                
                // Check if the current final text has an unclosed code block
                const codeBlockCount = (finalConvertedText.match(/```/g) || []).length;
                if (codeBlockCount % 2 !== 0) {
                    // Force close the code block before appending new content
                    finalConvertedText += '\n```\n';
                }

                // Merge logic: If the previous chunk ended with a code block and the new one starts with one, merge them.
                // This fixes split ASCII art or code blocks across chunks.
                let chunkToAdd = convertedChunk;
                
                if (finalConvertedText.trim().endsWith('```') && chunkToAdd.trim().startsWith('```')) {
                    // Remove the closing ``` from the previous text
                    finalConvertedText = finalConvertedText.trimEnd().slice(0, -3);
                    
                    // Remove the opening ```[lang] from the new chunk
                    chunkToAdd = chunkToAdd.trimStart().replace(/^```[a-z]*\n?/, '');
                    
                    // Add a newline for continuity if needed
                    finalConvertedText += '\n' + chunkToAdd + '\n\n';
                } else {
                    finalConvertedText += chunkToAdd + '\n\n';
                }

                output.value = finalConvertedText;
                // Scroll to the bottom of the textarea
                output.scrollTop = output.scrollHeight;
            }
            progressText.textContent = '変換が完了しました！';
            downloadBtn.disabled = false;

        } catch (error) {
            finalConvertedText += `\n\n=== エラーが発生しました ===\n${error.message}`;
            output.value = finalConvertedText;
            output.scrollTop = output.scrollHeight;
            progressText.textContent = 'エラーにより処理を中断しました。';
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
