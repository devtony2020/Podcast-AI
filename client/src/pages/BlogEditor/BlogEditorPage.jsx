import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar/Sidebar';
import { 
  FaSave, 
  FaArrowRight, 
  FaBold, 
  FaItalic, 
  FaListUl, 
  FaListOl, 
  FaHeading,
  FaMagic,
  FaChartLine,
  FaSpinner,
  FaLink,
  FaQuoteLeft,
  FaImage,
  FaUndo,
  FaRedo,
  FaEdit,
  FaTimes,
  FaHome
} from 'react-icons/fa';
import './blogeditor.css';

const BlogEditor = () => {
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [keywords, setKeywords] = useState([]);
  const [tone, setTone] = useState('professional');
  const [seoScore, setSeoScore] = useState(0);
  const [activeTab, setActiveTab] = useState('editor');
  const [isGenerating, setIsGenerating] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Load transcription from localStorage
  useEffect(() => {
    const savedProject = JSON.parse(localStorage.getItem('currentProject') || '{}');
    if (savedProject.transcription) {
      setContent(savedProject.transcription);
      if (savedProject.title) setTitle(savedProject.title);
      if (savedProject.keywords) setKeywords(savedProject.keywords);
    }
  }, []);

  // Auto-generate title from first sentence of transcription
  useEffect(() => {
    if (content && !title) {
      const firstSentence = content.split('.')[0];
      if (firstSentence.length > 10 && firstSentence.length < 60) {
        setTitle(firstSentence);
      }
    }
  }, [content, title]);

  // Auto-extract keywords from transcription
  useEffect(() => {
    if (content && keywords.length < 3) {
      const words = content.toLowerCase().split(/\s+/);
      const potentialKeywords = ['podcast', 'episode', 'discussion', ...words]
        .filter(word => word.length > 3)
        .filter((word, i, arr) => arr.indexOf(word) === i)
        .slice(0, 5);
      setKeywords(potentialKeywords);
    }
  }, [content, keywords]);

  // Update word and character counts
  useEffect(() => {
    const words = content.split(/\s+/).filter(word => word.length > 0);
    setWordCount(words.length);
    setCharCount(content.length);
  }, [content]);

  const updateSeoScore = () => {
    const score = Math.min(100, 
      (title.length > 10 ? 20 : title.length * 2) + 
      (keywords.length * 5) + 
      (content.length > 300 ? 30 : content.length / 10) +
      (content.includes(keywords[0] || '') ? 15 : 0)
    );
    setSeoScore(Math.round(score));
  };

  useEffect(() => {
    updateSeoScore();
  }, [title, content, keywords]);

  const generateAIBlog = () => {
    setIsGenerating(true);
    // Simulate AI processing delay
    setTimeout(() => {
      const aiGeneratedContent = `# ${title}\n\nIn this episode, we discuss ${keywords.join(', ')}. \n\n${content.substring(0, 500)}\n\n## Key Takeaways\n\n[AI-generated insights and summary would appear here]`;
      setContent(aiGeneratedContent);
      setIsGenerating(false);
    }, 2000);
  };

  const handleAddKeyword = () => {
    if (newKeyword.trim() && !keywords.includes(newKeyword.toLowerCase())) {
      setKeywords([...keywords, newKeyword.toLowerCase()]);
      setNewKeyword('');
    }
  };

  const saveDraft = () => {
    const projectData = {
      title,
      content,
      keywords,
      tone,
      seoScore,
      lastSaved: new Date().toISOString()
    };
    localStorage.setItem('currentProject', JSON.stringify(projectData));
    alert('Draft saved successfully!');
  };

  const continueToMetadata = () => {
    saveDraft();
    navigate('/metadata');
  };

  const formatText = (command, value = null) => {
    document.execCommand(command, false, value);
    document.getElementById('editor').focus();
  };

  return (
    <div className="blog-editor-container">
      {/* Header with left title and right menu button */}
      <header className="mobile-header">
        <div className="header-content">
          <div className="navbar-title">
            <FaHome className="home-icon" />
            <span>Blog Editor</span>
          </div>
          <button 
            className="menu-toggle" 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle menu"
          >
            {sidebarOpen ? <FaTimes /> : <FaEdit />}
          </button>
        </div>
      </header>

      <Sidebar isOpen={sidebarOpen} />
      
      <div className={`blog-editor-content ${sidebarOpen ? 'sidebar-active' : ''}`}>
        <div className="glass-card">
          <header className="editor-header">
            <h1 className="editor-title">Podcast to Blog Editor</h1>
            <p className="editor-subtitle">Transform your podcast transcription into an SEO-optimized blog post</p>
          </header>

          <div className="editor-tabs">
            <button 
              className={`tab-btn ${activeTab === 'editor' ? 'active' : ''}`}
              onClick={() => setActiveTab('editor')}
            >
              Editor
            </button>
            <button 
              className={`tab-btn ${activeTab === 'preview' ? 'active' : ''}`}
              onClick={() => setActiveTab('preview')}
            >
              Preview
            </button>
            <button 
              className={`tab-btn ${activeTab === 'seo' ? 'active' : ''}`}
              onClick={() => setActiveTab('seo')}
            >
              SEO Analysis
            </button>
          </div>

          {activeTab === 'editor' && (
            <div className="tab-content">
              <div className="seo-fields">
                <div className="input-group">
                  <label htmlFor="blog-title">Blog Title</label>
                  <input
                    id="blog-title"
                    type="text"
                    placeholder="Enter a compelling title"
                    className="input-field"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength="60"
                  />
                  <div className="character-count">{title.length}/60</div>
                </div>
                
                <div className="keyword-section">
                  <label>Keywords</label>
                  <div className="keyword-chips">
                    {keywords.map((keyword, index) => (
                      <span key={index} className="chip">
                        {keyword}
                        <button 
                          onClick={() => setKeywords(keywords.filter((_, i) => i !== index))}
                          className="chip-remove"
                          aria-label={`Remove ${keyword}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <div className="keyword-input-group">
                      <input
                        type="text"
                        placeholder="Add keyword"
                        className="input-field keyword-input"
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword()}
                      />
                      <button 
                        onClick={handleAddKeyword}
                        className="add-keyword-btn"
                        disabled={!newKeyword.trim()}
                        aria-label="Add keyword"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="tone-selection">
                  <label htmlFor="tone-select">Tone:</label>
                  <select
                    id="tone-select"
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="input-field"
                  >
                    <option value="professional">Professional</option>
                    <option value="conversational">Conversational</option>
                    <option value="authoritative">Authoritative</option>
                    <option value="friendly">Friendly</option>
                    <option value="informative">Informative</option>
                  </select>
                </div>
              </div>
              
              <div className="rich-text-editor">
                <div className="toolbar">
                  <div className="toolbar-group">
                    <button 
                      className="toolbar-btn" 
                      onClick={() => formatText('bold')}
                      title="Bold"
                      aria-label="Bold"
                    >
                      <FaBold />
                    </button>
                    <button 
                      className="toolbar-btn" 
                      onClick={() => formatText('italic')}
                      title="Italic"
                      aria-label="Italic"
                    >
                      <FaItalic />
                    </button>
                  </div>
                  
                  <div className="toolbar-group">
                    <button 
                      className="toolbar-btn"
                      onClick={() => formatText('insertUnorderedList')}
                      title="Bullet List"
                      aria-label="Bullet List"
                    >
                      <FaListUl />
                    </button>
                    <button 
                      className="toolbar-btn"
                      onClick={() => formatText('insertOrderedList')}
                      title="Numbered List"
                      aria-label="Numbered List"
                    >
                      <FaListOl />
                    </button>
                  </div>
                  
                  <div className="toolbar-group">
                    <button 
                      className="toolbar-btn"
                      onClick={() => formatText('formatBlock', '<h2>')}
                      title="Heading"
                      aria-label="Heading"
                    >
                      <FaHeading />
                    </button>
                    <button 
                      className="toolbar-btn"
                      onClick={() => formatText('createLink', prompt('Enter URL:'))}
                      title="Link"
                      aria-label="Link"
                    >
                      <FaLink />
                    </button>
                  </div>
                  
                  <div className="toolbar-group">
                    <button 
                      className="toolbar-btn"
                      onClick={() => formatText('formatBlock', '<blockquote>')}
                      title="Quote"
                      aria-label="Quote"
                    >
                      <FaQuoteLeft />
                    </button>
                    <button 
                      className="toolbar-btn"
                      onClick={() => formatText('insertImage', prompt('Image URL:'))}
                      title="Image"
                      aria-label="Image"
                    >
                      <FaImage />
                    </button>
                  </div>
                  
                  <div className="toolbar-group">
                    <button 
                      className="toolbar-btn"
                      onClick={() => formatText('undo')}
                      title="Undo"
                      aria-label="Undo"
                    >
                      <FaUndo />
                    </button>
                    <button 
                      className="toolbar-btn"
                      onClick={() => formatText('redo')}
                      title="Redo"
                      aria-label="Redo"
                    >
                      <FaRedo />
                    </button>
                  </div>
                </div>
                
                <div
                  id="editor"
                  className="editor"
                  contentEditable
                  dangerouslySetInnerHTML={{ __html: content }}
                  onInput={(e) => setContent(e.target.innerHTML)}
                  placeholder="Start writing your blog post here..."
                />
                
                <div className="editor-footer">
                  <div className="stats">
                    <span>Words: {wordCount}</span>
                    <span>Characters: {charCount}</span>
                  </div>
                  <div className="seo-score-display">
                    <FaChartLine />
                    <span>SEO Score: {seoScore}%</span>
                  </div>
                </div>
              </div>
              
              <button 
                className="ai-generate-btn"
                onClick={generateAIBlog}
                disabled={isGenerating || !content}
                aria-label="Enhance with AI"
              >
                {isGenerating ? (
                  <>
                    <FaSpinner className="spinner" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FaMagic />
                    Enhance with AI
                  </>
                )}
              </button>
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="tab-content">
              <div className="preview-container">
                <h2 className="preview-title">{title || 'Your Blog Title'}</h2>
                <div className="preview-meta">
                  <span className="preview-date">{new Date().toLocaleDateString()}</span>
                  {keywords.length > 0 && (
                    <span className="preview-keywords">Keywords: {keywords.join(', ')}</span>
                  )}
                  <span className="preview-tone">Tone: {tone}</span>
                </div>
                <div 
                  className="preview-content"
                  dangerouslySetInnerHTML={{ __html: content || '<p>Your blog content will appear here...</p>' }}
                />
              </div>
            </div>
          )}

          {activeTab === 'seo' && (
            <div className="tab-content">
              <div className="seo-score-card">
                <div className="score-circle" style={{ 
                  background: `conic-gradient(#4CAF50 0% ${seoScore}%, rgba(255,255,255,0.1) ${seoScore}% 100%)`
                }}>
                  <div className="score-value">{seoScore}%</div>
                  <div className="score-label">SEO Score</div>
                </div>
                <div className="score-breakdown">
                  <h3>Optimization Tips</h3>
                  <ul>
                    <li className={title.length >= 10 && title.length <= 60 ? 'passed' : 'failed'}>
                      {title.length >= 10 && title.length <= 60 ? '✓' : '✗'} Title length (10-60 chars)
                    </li>
                    <li className={keywords.length >= 3 ? 'passed' : 'failed'}>
                      {keywords.length >= 3 ? '✓' : '✗'} At least 3 keywords
                    </li>
                    <li className={wordCount >= 300 ? 'passed' : 'failed'}>
                      {wordCount >= 300 ? '✓' : '✗'} Minimum 300 words
                    </li>
                    <li className={content.includes(keywords[0] || '') ? 'passed' : 'failed'}>
                      {content.includes(keywords[0] || '') ? '✓' : '✗'} First keyword used in content
                    </li>
                    <li className={content.includes('<h2>') ? 'passed' : 'failed'}>
                      {content.includes('<h2>') ? '✓' : '✗'} Uses subheadings
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}
          
          <div className="editor-actions">
            <button 
              className="secondary-button"
              onClick={saveDraft}
              aria-label="Save draft"
            >
              <FaSave /> Save Draft
            </button>
            <button 
              className="primary-button"
              onClick={continueToMetadata}
              aria-label="Continue to metadata"
            >
              Continue to Metadata <FaArrowRight />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlogEditor;