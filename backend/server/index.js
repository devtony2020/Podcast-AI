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

// Initialize Appwrite client (for database operations only)
const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const openai = process.env.OPENAI_KEY ? new OpenAI({ apiKey: process.env.OPENAI_KEY }) : null;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:8080'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Direct Appwrite file upload using HTTP module (bypasses broken SDK)
async function uploadToAppwriteDirect(filePath, fileName) {
  return new Promise((resolve, reject) => {
    console.log('📤 Direct upload started for:', fileName);
    
    try {
      const fileData = fs.readFileSync(filePath);
      const boundary = '----WebKitFormBoundary' + Math.random().toString(16).substr(2);
      const fileId = ID.unique(); // Generate unique file ID
      
      // Build multipart form data manually
      let body = '';
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="fileId"\r\n\r\n`;
      body += `${fileId}\r\n`;
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`;
      body += 'Content-Type: application/octet-stream\r\n\r\n';
      body += fileData;
      body += `\r\n--${boundary}--\r\n`;
      
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
          'Content-Length': Buffer.byteLength(body)
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
            console.error('❌ Upload failed with status:', res.statusCode);
            reject(new Error(`Upload failed: ${res.statusCode} - ${data}`));
          }
        });
      });
      
      req.on('error', (error) => {
        console.error('🔥 HTTP request error:', error);
        reject(error);
      });
      
      // Send the request
      req.write(body);
      req.end();
      
    } catch (error) {
      console.error('🔥 Error in upload function:', error);
      reject(error);
    }
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(400).json({ 
      success: false, 
      error: err.code === 'LIMIT_FILE_SIZE' 
        ? 'File size exceeds 30MB limit' 
        : 'File upload error' 
    });
  }
  
  console.error('Error:', err.message);
  res.status(500).json({ success: false, error: 'Server error' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Server is running', 
    timestamp: new Date().toISOString(),
    services: {
      appwrite: true,
      openai: !!openai
    }
  });
});

// Upload and process endpoint - FIXED WITH DIRECT HTTP UPLOAD
app.post('/upload-and-process', upload.single('file'), async (req, res) => {
  let filePath = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    filePath = req.file.path;
    const episodeId = ID.unique();
    
    console.log('Processing file:', req.file.originalname, 'Size:', req.file.size);

    // Upload file to Appwrite using DIRECT HTTP (bypass broken SDK)
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
        file_name: req.file.originalname,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        appwrite_file_id: uploadResult.$id
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

    // Process with OpenAI if available
    if (openai) {
      try {
        console.log('Starting OpenAI transcription...');
        
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(filePath),
          model: 'whisper-1',
          response_format: 'text'
        });
        
        const transcriptText = transcription;
        console.log('Transcription completed, length:', transcriptText.length);

        await databases.updateDocument(
          process.env.APPWRITE_DATABASE_ID || 'bytebao_db',
          'transcripts', 
          transcriptDoc.$id, 
          { transcript_text: transcriptText }
        );

        const generationPrompt = `From this podcast transcript: "${transcriptText}" 
        Generate a JSON object with these fields:
        - blog_post: A well-structured SEO-optimized blog post (800-1200 words)
        - seo_title: An engaging SEO title under 60 characters
        - meta_description: Compelling meta description under 160 characters  
        - tags: 5-7 relevant tags as an array
        - twitter_snippet: Engaging tweet under 280 characters
        - instagram_caption: Instagram caption with 3-5 relevant hashtags
        - linkedin_intro: Professional LinkedIn introduction (2-3 paragraphs)`;

        console.log('Generating blog content with GPT...');
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: generationPrompt }],
          response_format: { type: 'json_object' },
          max_tokens: 2500
        });

        const generated = JSON.parse(response.choices[0].message.content);
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
            tags: generated.tags || [],
            created_at: new Date().toISOString()
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
            linkedin_intro: generated.linkedin_intro || '',
            created_at: new Date().toISOString()
          }
        );

      } catch (openaiError) {
        console.error('OpenAI processing error:', openaiError);
        await databases.updateDocument(
          process.env.APPWRITE_DATABASE_ID || 'bytebao_db',
          'transcripts', 
          transcriptDoc.$id, 
          { transcript_text: 'OpenAI processing failed: ' + openaiError.message }
        );
      }
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
      fs.unlinkSync(filePath);
    }
    
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Server error during processing' 
    });
  }
});

// Get data endpoint
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
      error: error.message || 'Server error fetching data' 
    });
  }
});

// Enhance blog endpoint
app.post('/enhance-blog/:episodeId', async (req, res) => {
  try {
    if (!openai) {
      return res.status(400).json({ 
        success: false, 
        error: 'OpenAI key not configured' 
      });
    }

    const { episodeId } = req.params;
    const blogResponse = await databases.listDocuments(
      process.env.APPWRITE_DATABASE_ID || 'bytebao_db',
      'blog_posts', 
      [`equal("episode_id","${episodeId}")`]
    );
    
    const blog = blogResponse.documents[0];

    if (!blog || !blog.blog_content) {
      return res.status(404).json({ 
        success: false, 
        error: 'Blog not found' 
      });
    }

    const prompt = `Enhance this blog post for better SEO and engagement: "${blog.blog_content}" 
    Generate a JSON object with these fields:
    - enhanced_blog_post: Improved version of the blog (more engaging, better structure)
    - improved_seo_title: Better SEO title under 60 characters  
    - improved_meta_description: Better meta description under 160 characters
    - updated_tags: Updated relevant tags as an array`;

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
        tags: enhanced.updated_tags || blog.tags,
        updated_at: new Date().toISOString()
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
      error: error.message || 'Server error enhancing blog' 
    });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📁 Upload directory: ${path.join(process.cwd(), 'uploads')}`);
  console.log(`🤖 OpenAI configured: ${!!openai}`);
  console.log(`🌐 CORS enabled for: localhost:3000, localhost:5173, localhost:8080`);
  console.log(`🔧 Appwrite Project: ${process.env.APPWRITE_PROJECT_ID}`);
  console.log(`📤 Using DIRECT HTTP upload (SDK bypassed)`);
});