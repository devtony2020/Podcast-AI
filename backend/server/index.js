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
    fileSize: 30 * 1024 * 1024,
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
  origin: function(origin, callback) {
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

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// ---------- Direct Appwrite file upload ----------
async function uploadToAppwriteDirect(filePath, fileName) {
  return new Promise((resolve, reject) => {
    console.log('📤 Direct upload started for:', fileName);

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

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          console.log('📨 Appwrite response status:', res.statusCode);

          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const result = JSON.parse(data);
              console.log('✅ Direct upload successful:', result.$id);
              resolve(result);
            } catch (parseError) {
              console.error('❌ Parse error:', parseError);
              reject(new Error(`Failed to parse response: ${parseError.message}`));
            }
          } else {
            console.error('❌ Upload failed with status:', res.statusCode, data);
            reject(new Error(`Upload failed: ${res.statusCode} - ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        console.error('🔥 HTTP request error:', error);
        reject(error);
      });

      req.write(body);
      req.end();

    } catch (error) {
      console.error('🔥 Error in upload function:', error);
      reject(error);
    }
  });
}

// ---------- Error handling middleware ----------
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(400).json({
      success: false,
      error: err.code === 'LIMIT_FILE_SIZE' ? 'File size exceeds 30MB limit' : 'File upload error'
    });
  }

  console.error('Error:', err && err.message ? err.message : err);
  res.status(500).json({ success: false, error: err && err.message ? err.message : 'Server error' });
});

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

// ---------- Upload and process endpoint ----------
app.post('/upload-and-process', upload.single('file'), async (req, res) => {
  let filePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    filePath = req.file.path;
    const episodeId = ID.unique();

    console.log('Processing file:', req.file.originalname, 'Size:', req.file.size);

    // Upload file to Appwrite
    const uploadResult = await uploadToAppwriteDirect(
      filePath,
      `${episodeId}_${req.file.originalname}`
    );

    const fileUrl = `${process.env.APPWRITE_ENDPOINT}/storage/buckets/${uploadResult.bucketId}/files/${uploadResult.$id}/view?project=${process.env.APPWRITE_PROJECT_ID}`;

    // Create transcript document
    const transcriptDoc = await databases.createDocument(
      process.env.APPWRITE_DATABASE_ID || 'bytebao_db',
      'transcripts',
      ID.unique(),
      {
        episode_id: episodeId,
        transcript_text: 'Transcription in progress...',
        upload_date: new Date().toISOString(),
        appwrite_file_id: uploadResult.$id,
        file_url: fileUrl
      }
    );

    // Create publish queue entry
    await databases.createDocument(
      process.env.APPWRITE_DATABASE_ID || 'bytebao_db',
      'publish_queue',
      ID.unique(),
      {
        episode_id: episodeId,
        status: 'draft',
        platforms: ['instagram', 'tiktok', 'youtube'],
        created_at: new Date().toISOString()
      }
    );

    // Process with OpenAI if configured
    if (openai) {
      try {
        console.log('Starting OpenAI transcription...');

        const transcriptionResponse = await openai.audio.transcriptions.create({
          file: fs.createReadStream(filePath),
          model: 'whisper-1',
          response_format: 'text'
        });

        const transcriptText = typeof transcriptionResponse === 'string'
          ? transcriptionResponse
          : (transcriptionResponse.text || transcriptionResponse);

        console.log('Transcription completed, length:', transcriptText ? transcriptText.length : 0);

        // Update transcript doc with real transcript
        await databases.updateDocument(
          process.env.APPWRITE_DATABASE_ID || 'bytebao_db',
          'transcripts',
          transcriptDoc.$id,
          { transcript_text: transcriptText }
        );

        // Prepare prompt for content generation
        const generationPrompt = `From this podcast transcript: "${transcriptText}"
Generate a JSON object with these fields:
- blog_post
- seo_title
- meta_description
- tags
- twitter_snippet
- instagram_caption
- linkedin_intro`;

        console.log('Generating blog content with GPT...');
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: generationPrompt }],
          response_format: { type: 'json_object' },
          max_tokens: 2500
        });

        let generated = {};
        try {
          generated = JSON.parse(response.choices[0].message.content);
        } catch (parseErr) {
          console.warn('Warning: failed to parse GPT response, using raw content');
          generated.blog_post = response.choices[0].message.content || '';
        }

        console.log('Content generation completed');

        // Create blog post
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

        // Create social snippets
        await databases.createDocument(
          process.env.APPWRITE_DATABASE_ID || 'bytebao_db',
          'snippets',
          ID.unique(),
          {
            episode_id: episodeId,
            twitter_snippet: generated.twitter_snippet || '',
            instagram_caption: generated.instagram_caption || '',
            linkedin_intro: generated.linkedin_intro || ''
          }
        );

      } catch (openaiError) {
        console.error('OpenAI processing error:', openaiError);
        try {
          await databases.updateDocument(
            process.env.APPWRITE_DATABASE_ID || 'bytebao_db',
            'transcripts',
            transcriptDoc.$id,
            { transcript_text: 'OpenAI processing failed: ' + (openaiError.message || openaiError) }
          );
        } catch (updErr) {
          console.error('Failed to update transcript doc after OpenAI error:', updErr);
        }
      }
    } else {
      console.log('OpenAI not configured; skipping transcription/generation step.');
    }

    // Clean up uploaded file
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('Temporary file cleaned up');
    }

    res.json({
      success: true,
      episodeId,
      fileUrl,
      message: openai ? 'File processed successfully' : 'File uploaded but OpenAI not configured'
    });

  } catch (error) {
    console.error('Upload error:', error);
    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }
    res.status(500).json({
      success: false,
      error: error && error.message ? error.message : 'Server error during processing'
    });
  }
});

// ---------- Get data endpoint ----------
app.get('/get-data/:episodeId', async (req, res) => {
  try {
    const { episodeId } = req.params;

    const [blog, snippets, transcript] = await Promise.all([
      databases.listDocuments(
        process.env.APPWRITE_DATABASE_ID || 'bytebao_db',
        'blog_posts',
        [`equal("episode_id","${episodeId}")`]
      ),
      databases.listDocuments(
        process.env.APPWRITE_DATABASE_ID || 'bytebao_db',
        'snippets',
        [`equal("episode_id","${episodeId}")`]
      ),
      databases.listDocuments(
        process.env.APPWRITE_DATABASE_ID || 'bytebao_db',
        'transcripts',
        [`equal("episode_id","${episodeId}")`]
      )
    ]);

    res.json({
      success: true,
      blog: blog.documents[0] || null,
      snippets: snippets.documents[0] || null,
      transcript: transcript.documents[0] || null
    });

  } catch (error) {
    console.error('Get data error:', error);
    res.status(500).json({
      success: false,
      error: error && error.message ? error.message : 'Server error fetching data'
    });
  }
});

// ---------- Enhance blog endpoint ----------
app.post('/enhance-blog/:episodeId', async (req, res) => {
  try {
    if (!openai) {
      return res.status(400).json({ success: false, error: 'OpenAI key not configured' });
    }

    const { episodeId } = req.params;
    const blogResponse = await databases.listDocuments(
      process.env.APPWRITE_DATABASE_ID || 'bytebao_db',
      'blog_posts',
      [`equal("episode_id","${episodeId}")`]
    );

    const blog = blogResponse.documents[0];

    if (!blog || !blog.blog_content) {
      return res.status(404).json({ success: false, error: 'Blog not found' });
    }

    const prompt = `Enhance this blog post for better SEO and engagement: "${blog.blog_content}"
Generate a JSON object with these fields:
- enhanced_blog_post
- improved_seo_title
- improved_meta_description
- updated_tags`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 2000
    });

    const enhanced = JSON.parse(response.choices[0].message.content);

    await databases.updateDocument(
      process.env.APPWRITE_DATABASE_ID || 'bytebao_db',
      'blog_posts',
      blog.$id,
      {
        blog_content: enhanced.enhanced_blog_post || blog.blog_content,
        seo_title: enhanced.improved_seo_title || blog.seo_title,
        meta_description: enhanced.improved_meta_description || blog.meta_description,
        tags: enhanced.updated_tags || blog.tags
      }
    );

    res.json({
      success: true,
      episodeId,
      message: 'Blog enhanced successfully'
    });

  } catch (error) {
    console.error('Enhance blog error:', error);
    res.status(500).json({
      success: false,
      error: error && error.message ? error.message : 'Server error enhancing blog'
    });
  }
});

// ---------- Start server ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📁 Upload directory: ${path.join(process.cwd(), 'uploads')}`);
  console.log(`🤖 OpenAI configured: ${!!openai}`);
  console.log(`🌐 CORS allowed origins: ${allowedOrigins.join(', ')}`);
  console.log(`🔧 Appwrite Project: ${process.env.APPWRITE_PROJECT_ID}`);
  console.log(`📤 Using DIRECT HTTP upload (SDK bypassed)`);
});
