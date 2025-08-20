require('dotenv').config();
const express = require('express');
const { Client, Storage, Databases, ID } = require('appwrite');
const OpenAI = require('openai');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const storage = new Storage(client);
const databases = new Databases(client);
const openai = process.env.OPENAI_KEY ? new OpenAI({ apiKey: process.env.OPENAI_KEY }) : null;

app.use(express.json());

app.post('/upload-and-process', upload.single('file'), async (req, res) => {
    try {
        const filePath = req.file.path;
        const episodeId = ID.unique();

        // Upload to single bucket with prefix
        const filePrefix = req.file.mimetype.startsWith('audio') || req.file.mimetype.startsWith('video') ? 'raw/' : 'generated/';
        const uploadResult = await storage.createFile('bytebao_storage', `${filePrefix}${episodeId}`, filePath);
        const fileUrl = `${process.env.APPWRITE_ENDPOINT}/storage/buckets/bytebao_storage/files/${uploadResult.$id}/view?project=${process.env.APPWRITE_PROJECT_ID}`;

        // Save basic document (even without OpenAI)
        await databases.createDocument('bytebao_db', 'transcripts', ID.unique(), {
            episode_id: episodeId,
            transcript_text: 'Transcription pending OpenAI key',
            upload_date: new Date().toISOString(),
        });

        await databases.createDocument('bytebao_db', 'publish_queue', ID.unique(), {
            episode_id: episodeId,
            status: 'draft',
            platforms: ['instagram', 'tiktok', 'youtube'],
        });

        // Process with OpenAI if key is available
        if (openai) {
            const transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(filePath),
                model: 'whisper-1',
            });
            const transcriptText = transcription.text;

            await databases.updateDocument('bytebao_db', 'transcripts', (await databases.listDocuments('bytebao_db', 'transcripts', [`equal("episode_id", "${episodeId}")`])).documents[0].$id, {
                transcript_text: transcriptText,
            });

            const generationPrompt = `
            From this transcript: "${transcriptText}"
            Generate in JSON format:
            - blog_post (full text)
            - seo_title
            - meta_description
            - tags (array of 5-10 keywords)
            - twitter_snippet
            - instagram_caption
            - linkedin_intro
            `;
            const response = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [{ role: 'user', content: generationPrompt }],
                response_format: { type: 'json_object' },
            });
            const generated = JSON.parse(response.choices[0].message.content);

            await databases.createDocument('bytebao_db', 'blog_posts', ID.unique(), {
                episode_id: episodeId,
                blog_content: generated.blog_post,
                seo_title: generated.seo_title,
                meta_description: generated.meta_description,
                tags: generated.tags,
            });

            await databases.createDocument('bytebao_db', 'snippets', ID.unique(), {
                episode_id: episodeId,
                twitter_snippet: generated.twitter_snippet,
                instagram_caption: generated.instagram_caption,
                linkedin_intro: generated.linkedin_intro,
            });
        }

        fs.unlinkSync(filePath);
        res.json({ success: true, episodeId });
    } catch (error) {
        console.error('Processing error:', error);
        fs.unlinkSync(req.file.path);
        res.status(500).json({ error: error.message });
    }
});

app.get('/get-data/:episodeId', async (req, res) => {
    try {
        const { episodeId } = req.params;
        const [blog, snippets] = await Promise.all([
            databases.listDocuments('bytebao_db', 'blog_posts', [`equal("episode_id", "${episodeId}")`]),
            databases.listDocuments('bytebao_db', 'snippets', [`equal("episode_id", "${episodeId}")`]),
        ]);
        res.json({
            blog: blog.documents[0] || {},
            snippets: snippets.documents[0] || {},
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/enhance-blog/:episodeId', async (req, res) => {
    try {
        if (!openai) {
            return res.status(400).json({ error: 'OpenAI key not configured' });
        }

        const { episodeId } = req.params;
        const blogResponse = await databases.listDocuments('bytebao_db', 'blog_posts', [`equal("episode_id", "${episodeId}")`]);
        const blog = blogResponse.documents[0];

        if (!blog || !blog.blog_content) {
            return res.status(404).json({ error: 'Blog not found' });
        }

        const prompt = `
        Enhance this blog post: "${blog.blog_content}"
        Generate in JSON format:
        - enhanced_blog_post (improved full text with better structure and engagement)
        - improved_seo_title
        - improved_meta_description
        - updated_tags (array of 5-10 optimized keywords)
        `;
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
        });
        const enhanced = JSON.parse(response.choices[0].message.content);

        await databases.updateDocument('bytebao_db', 'blog_posts', blog.$id, {
            blog_content: enhanced.enhanced_blog_post,
            seo_title: enhanced.improved_seo_title,
            meta_description: enhanced.improved_meta_description,
            tags: enhanced.updated_tags,
        });

        res.json({ success: true, episodeId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));