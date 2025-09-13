require('dotenv').config();
const express = require('express');
const { Client, Databases, ID } = require('node-appwrite');
const OpenAI = require('openai');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const https = require('https');
const { URL } = require('url');

const app = express();
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 30 * 1024 * 1024, // 30MB max
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio and video files are allowed'), false);
    }
  }
});

// ---------- Appwrite + OpenAI clients ----------
const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const openai = process.env.OPENAI_KEY ? new OpenAI({ apiKey: process.env.OPENAI_KEY }) : null;

// ---------- Dynamic CORS ----------
const rawOrigins = process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://localhost:8080';
const allowedOrigins = rawOrigins.split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    } else {
      return callback(new Error('CORS policy: This origin is not allowed: ' + origin));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure uploads folder exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// ---------- Direct Appwrite file upload ----------
async function uploadToAppwriteDirect(filePath, fileName) {
  return new Promise((resolve, reject) => {
    try {
      const fileData = fs.readFileSync(filePath);
      const boundary = '----WebKitFormBoundary' + Math.random().toString(16).substr(2);
      const fileId = ID.unique();

      let bodyBufferParts = [];
      bodyBufferParts.push(Buffer.from(`--${boundary}\r\n`));
      bodyBufferParts.push(Buffer.from(`Content-Disposition: form-data; name="fileId"\r\n\r\n`));
      bodyBufferParts.push(Buffer.from(`${fileId}\r\n`));
      bodyBufferParts.push(Buffer.from(`--${boundary}\r\n`));
      bodyBufferParts.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`));
      bodyBufferParts.push(Buffer.from('Content-Type: application/octet-stream\r\n\r\n'));
      bodyBufferParts.push(Buffer.from(fileData));
      bodyBufferParts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

      const body = Buffer.concat(bodyBufferParts);
      const appwriteUrl = new URL(`${process.env.APPWRITE_ENDPOINT}/storage/buckets/${process.env.APPWRITE_STORAGE_BUCKET_ID || 'bytebao_storage'}/files`);

      const options = {
        hostname: appwriteUrl.hostname,
        port: appwriteUrl.port || 443,
        path: appwriteUrl.pathname,
        method: 'POST',
        headers: {
          'X-Appwrite-Project': process.env.APPWRITE_PROJECT_ID,
          'X-Appwrite-Key': process.env.APPWRITE_API_KEY,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const result = JSON.parse(data);
              resolve(result);
            } catch (err) {
              reject(new Error(`Failed to parse response: ${err.message}`));
            }
          } else {
            reject(new Error(`Upload failed: ${res.statusCode} - ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ---------- Health check ----------
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    services: {
      appwrite: !!process.env.APPWRITE_PROJECT_ID,
      openai: !!openai
    }
  });
});

// ---------- Upload + Process ----------
app.post('/upload-and-process', upload.single('file'), async (req, res) => {
  let filePath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    filePath = req.file.path;
    const episodeId = ID.unique();

    // Upload to Appwrite Storage
    const uploadResult = await uploadToAppwriteDirect(filePath, `${episodeId}_${req.file.originalname}`);

    // Create transcript doc (NO file_url here ✅)
    const transcriptDoc = await databases.createDocument(
      process.env.APPWRITE_DATABASE_ID || 'bytebao_db',
      'transcripts',
      ID.unique(),
      {
        episode_id: episodeId,
        transcript_text: 'Transcription in progress...',
        upload_date: new Date().toISOString(),
        appwrite_file_id: uploadResult.$id
      }
    );

    // Create publish queue entry (NO created_at here ✅)
    await databases.createDocument(
      process.env.APPWRITE_DATABASE_ID || 'bytebao_db',
      'publish_queue',
      ID.unique(),
      {
        episode_id: episodeId,
        status: 'draft',
        platforms: ['instagram', 'tiktok', 'youtube']
      }
    );

    // OpenAI processing
    if (openai) {
      try {
        // Transcription
        const transcriptionResponse = await openai.audio.transcriptions.create({
          file: fs.createReadStream(filePath),
          model: 'whisper-1',
          response_format: 'text'
        });

        const transcriptText = typeof transcriptionResponse === 'string'
          ? transcriptionResponse
          : (transcriptionResponse.text || transcriptionResponse);

        await databases.updateDocument(
          process.env.APPWRITE_DATABASE_ID || 'bytebao_db',
          'transcripts',
          transcriptDoc.$id,
          { transcript_text: transcriptText }
        );

        // Content generation
        const prompt = `From this podcast transcript: "${transcriptText}"
Generate JSON with:
- blog_post
- seo_title
- meta_description
- tags
- twitter_snippet
- instagram_caption
- linkedin_intro`;

        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          max_tokens: 2500
        });

        let generated = {};
        try {
          generated = JSON.parse(response.choices[0].message.content);
        } catch {
          generated.blog_post = response.choices[0].message.content || '';
        }

        // Blog
        await databases.createDocument(
          process.env.APPWRITE_DATABASE_ID || 'bytebao_db',
          'blog_posts',
          ID.unique(),
          {
            episode_id: episodeId,
            blog_content: generated.blog_post || '',
            seo_title: generated.seo_title || '',
            meta_description: generated.meta_description || '',
            tags: generated.tags || []
          }
        );

        // Snippets
        await databases.createDocument(
          process.env.APPWRITE_DATABASE_ID || 'bytebao_db',
          'snippets',
          ID.unique(),
          {
            episode_id: episodeId,
            twitter_snippet: generated.twitter_snippet || '',
            instagram_caption: generated.instagram_caption || '',
            linkedin_intro: generated.linkedin_intro || '',
            video_clips: []
          }
        );
      } catch (err) {
        console.error('OpenAI error:', err.message);
      }
    }

    // Clean up file
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ success: true, episodeId, message: 'File processed successfully' });
  } catch (error) {
    console.error('Upload error:', error.message);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.status(500).json({ success: false, error: error.message || 'Server error' });
  }
});

// ---------- Get Data ----------
app.get('/get-data/:episodeId', async (req, res) => {
  try {
    const { episodeId } = req.params;

    const [blog, snippets, transcript] = await Promise.all([
      databases.listDocuments(process.env.APPWRITE_DATABASE_ID || 'bytebao_db', 'blog_posts', [`equal("episode_id","${episodeId}")`]),
      databases.listDocuments(process.env.APPWRITE_DATABASE_ID || 'bytebao_db', 'snippets', [`equal("episode_id","${episodeId}")`]),
      databases.listDocuments(process.env.APPWRITE_DATABASE_ID || 'bytebao_db', 'transcripts', [`equal("episode_id","${episodeId}")`])
    ]);

    res.json({
      success: true,
      blog: blog.documents[0] || null,
      snippets: snippets.documents[0] || null,
      transcript: transcript.documents[0] || null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------- Start server ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});
