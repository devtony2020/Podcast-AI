import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Sidebar from '../../components/Sidebar/Sidebar';
import { FaSave, FaArrowRight, FaBold, FaItalic, FaListUl, FaListOl, FaHeading, FaCloudUploadAlt, FaExclamationCircle, FaTimes } from 'react-icons/fa';
import { databases, DATABASE_ID, COLLECTIONS, ID } from '../../lib/appwrite';
import axios from 'axios';
import './blogeditor.css';
import debounce from 'lodash/debounce';

const BlogEditor = () => {
  const navigate = useNavigate();
  const { episodeId } = useParams();
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [keywords, setKeywords] = useState([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contentSource, setContentSource] = useState('none');

  // Debounced content update
  const debouncedSetContent = useCallback(
    debounce((newContent) => setContent(newContent), 300),
    []
  );

  // Load data or initialize empty
  useEffect(() => {
    const loadData = async () => {
      console.log('Loading data for episodeId:', episodeId);
      setLoading(true);
      setError('');
      try {
        const savedProject = JSON.parse(localStorage.getItem('currentProject') || '{}');
        const currentEpisodeId = episodeId || savedProject.episodeId;

        if (currentEpisodeId) {
          try {
            const response = await axios.get(`${import.meta.env.VITE_BACKEND_URL}/get-data/${currentEpisodeId}`);
            const { blog } = response.data;
            if (blog && Object.keys(blog).length > 0) {
              setTitle(blog.seo_title || '');
              setContent(blog.blog_content || '');
              setKeywords(blog.tags || []);
              setContentSource('backend');
            } else {
              throw new Error('No blog data found');
            }
          } catch (fetchErr) {
            setError(`Backend fetch failed: ${fetchErr.message}. Using local data.`);
            if (savedProject.transcription) {
              setContent(savedProject.transcription);
              setTitle(savedProject.title || '');
              setKeywords(savedProject.keywords || []);
              setContentSource('local');
            } else {
              setContent('');
              setTitle('');
              setKeywords([]);
              setContentSource('none');
            }
          }
        } else {
          setContent('');
          setTitle('');
          setKeywords([]);
          setContentSource('none');
        }
      } catch (err) {
        setError(`Error loading data: ${err.message}. Starting empty.`);
        setContent('');
        setTitle('');
        setKeywords([]);
        setContentSource('none');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [episodeId]);

  // Save draft to Appwrite and localStorage
  const saveDraft = async () => {
    const projectData = { episodeId, title, content, keywords, lastSaved: new Date().toISOString() };
    localStorage.setItem('currentProject', JSON.stringify(projectData));

    try {
      if (episodeId) {
        const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.BLOG_POSTS, [`equal("episode_id", "${episodeId}")`]);
        const blogDocument = response.documents[0];

        if (blogDocument) {
          await databases.updateDocument(DATABASE_ID, COLLECTIONS.BLOG_POSTS, blogDocument.$id, {
            seo_title: title,
            blog_content: content,
            tags: keywords,
          });
        } else {
          await databases.createDocument(DATABASE_ID, COLLECTIONS.BLOG_POSTS, ID.unique(), {
            episode_id: episodeId,
            seo_title: title,
            blog_content: content,
            tags: keywords,
          });
        }
        alert('Draft saved successfully!');
      } else {
        setError('No episode ID. Saved locally.');
      }
    } catch (err) {
      setError(`Failed to save to database: ${err.message}. Saved locally.`);
    }
  };

  const continueToMetadata = () => {
    saveDraft();
    if (!error) navigate('/metadata');
  };

  const formatText = (command, value = null) => {
    document.execCommand(command, false, value);
    debouncedSetContent(document.getElementById('editor').innerHTML);
    document.getElementById('editor').focus();
  };

  const handleAddKeyword = () => {
    if (newKeyword.trim() && !keywords.includes(newKeyword.toLowerCase()) && keywords.length < 10) {
      setKeywords([...keywords, newKeyword.toLowerCase()]);
      setNewKeyword('');
    } else if (keywords.length >= 10) {
      setError('Maximum 10 keywords allowed.');
    }
  };

  // Upload status component
  const UploadStatus = () => {
    const getStatusText = () => {
      switch (contentSource) {
        case 'backend': return { text: 'Content loaded from server', color: '#4CAF50' };
        case 'local': return { text: 'Content loaded from local storage', color: '#FFC107' };
        case 'none': return { text: 'No content uploaded', color: '#FF5722' };
        default: return { text: 'No content uploaded', color: '#FF5722' };
      }
    };

    const { text, color } = getStatusText();
    return (
      <div className="upload-status" style={{ backgroundColor: color, color: '#fff', padding: '8px 16px', borderRadius: '4px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <FaCloudUploadAlt aria-hidden="true" />
        <span>{text}</span>
      </div>
    );
  };

  // Error toast component
  const ErrorToast = ({ message, onDismiss }) => (
    <div className="error-toast" role="alert" style={{ position: 'fixed', bottom: '20px', right: '20px', background: '#FF5722', color: '#fff', padding: '12px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 1000 }}>
      <FaExclamationCircle aria-hidden="true" />
      <span>{message}</span>
      <button onClick={onDismiss} className="dismiss-error" aria-label="Dismiss error">
        <FaTimes aria-hidden="true" />
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="blog-editor-container loading" role="status" aria-live="polite">
        <p>Loading blog data...</p>
      </div>
    );
  }

  return (
    <div className="blog-editor-container">
      {error && <ErrorToast message={error} onDismiss={() => setError('')} />}
      <Sidebar isOpen={false} />
      <div className="blog-editor-content">
        <div className="glass-card">
          <header className="editor-header">
            <h1 className="editor-title">Blog Editor</h1>
          </header>
          <UploadStatus />
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
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="rich-text-editor">
            <div className="toolbar" role="toolbar">
              <button className="toolbar-btn" onClick={() => formatText('bold')} title="Bold" aria-label="Bold text">
                <FaBold aria-hidden="true" />
              </button>
              <button className="toolbar-btn" onClick={() => formatText('italic')} title="Italic" aria-label="Italic text">
                <FaItalic aria-hidden="true" />
              </button>
              <button className="toolbar-btn" onClick={() => formatText('insertUnorderedList')} title="Bullet List" aria-label="Insert bullet list">
                <FaListUl aria-hidden="true" />
              </button>
              <button className="toolbar-btn" onClick={() => formatText('insertOrderedList')} title="Numbered List" aria-label="Insert numbered list">
                <FaListOl aria-hidden="true" />
              </button>
              <button className="toolbar-btn" onClick={() => formatText('formatBlock', '<h2>')} title="Heading" aria-label="Insert heading">
                <FaHeading aria-hidden="true" />
              </button>
            </div>
            <div
              id="editor"
              className="editor"
              contentEditable
              dangerouslySetInnerHTML={{ __html: content }}
              onInput={(e) => debouncedSetContent(e.target.innerHTML)}
              placeholder="Start writing your blog post here..."
              role="textbox"
              aria-multiline="true"
            />
          </div>
          <div className="editor-actions">
            <button className="secondary-button" onClick={saveDraft} aria-label="Save draft">
              <FaSave aria-hidden="true" /> Save Draft
            </button>
            <button className="primary-button" onClick={continueToMetadata} disabled={!episodeId} aria-label="Continue to metadata">
              Continue to Metadata <FaArrowRight aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlogEditor;