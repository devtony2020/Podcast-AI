import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar/Sidebar';
import { 
  FaSave, 
  FaArrowRight, 
  FaHeading, 
  FaAlignLeft, 
  FaPlus, 
  FaTrashAlt,
  FaArrowLeft,
  FaChartLine,
  FaLightbulb,
  FaHome,
  FaTags,
  FaTimes
} from 'react-icons/fa';
import { ID } from 'appwrite';
import { databases, DATABASE_ID, COLLECTIONS } from '../../lib/appwrite';
import axios from 'axios';
import './metadata.css';

const Metadata = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [seoScore, setSeoScore] = useState(0);
  const [suggestedTags, setSuggestedTags] = useState([]);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState('');
  const [episodeId, setEpisodeId] = useState('');

  useEffect(() => {
    const savedProject = JSON.parse(localStorage.getItem('currentProject') || '{}');
    const currentEpisodeId = savedProject.episodeId;

    if (currentEpisodeId) {
      setEpisodeId(currentEpisodeId);
      axios.get(`${import.meta.env.VITE_BACKEND_URL}/get-data/${currentEpisodeId}`)
        .then(response => {
          const { metadata } = response.data;
          if (metadata && Object.keys(metadata).length > 0) {
            setTitle(metadata.title || '');
            setDescription(metadata.description || '');
            setTags(metadata.tags || []);
          }
        })
        .catch(err => {
          setError(`Failed to fetch metadata: ${err.message}. Using local data.`);
        });
    } else {
      setEpisodeId(ID.unique());
    }

    // Fetch suggested tags dynamically (e.g., from an API)
    axios.get(`${import.meta.env.VITE_BACKEND_URL}/suggested-tags`)
      .then(response => {
        setSuggestedTags(response.data.tags || []);
      })
      .catch(() => {
        setSuggestedTags([]);
      });
  }, []);

  useEffect(() => {
    const score = Math.min(100, 
      (title.length > 10 && title.length <= 60 ? 30 : Math.max(0, title.length * 0.5)) +
      (description.length > 50 && description.length <= 160 ? 30 : Math.max(0, description.length * 0.2)) +
      (tags.length >= 3 ? 20 : Math.min(20, tags.length * 5)) +
      (tags.some(tag => title.toLowerCase().includes(tag)) ? 10 : 0) +
      (tags.some(tag => description.toLowerCase().includes(tag)) ? 10 : 0)
    );
    setSeoScore(Math.round(score));
  }, [title, description, tags]);

  const addTag = (e) => {
    if ((e.key === 'Enter' || e.type === 'click') && tagInput.trim() && !tags.includes(tagInput.trim().toLowerCase()) && tags.length < 10) {
      const newTag = tagInput.trim().toLowerCase();
      setTags([...tags, newTag]);
      setTagInput('');
      setSuggestedTags(suggestedTags.filter(tag => tag !== newTag));
    }
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
    setSuggestedTags([...suggestedTags, tagToRemove].filter(tag => !tags.includes(tag)));
  };

  const addSuggestedTag = (tag) => {
    if (!tags.includes(tag) && tags.length < 10) {
      setTags([...tags, tag]);
      setSuggestedTags(suggestedTags.filter(t => t !== tag));
    }
  };

  const saveMetadata = async () => {
    if (!title.trim() || !description.trim()) {
      setError('Title and description cannot be empty.');
      return;
    }

    const savedProject = JSON.parse(localStorage.getItem('currentProject') || {});
    savedProject.metadata = {
      title,
      description,
      tags,
      seoScore,
      lastUpdated: new Date().toISOString(),
      episodeId
    };
    localStorage.setItem('currentProject', JSON.stringify(savedProject));
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);

    try {
      const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.METADATA, [`equal("episode_id", "${episodeId}")`]);
      const metadataDoc = response.documents[0];
      const documentData = {
        episode_id: episodeId,
        title,
        description,
        tags,
        seo_score: seoScore,
        last_updated: new Date().toISOString(),
      };

      if (metadataDoc) {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.METADATA, metadataDoc.$id, documentData);
      } else {
        await databases.createDocument(DATABASE_ID, COLLECTIONS.METADATA, ID.unique(), documentData);
      }
    } catch (err) {
      setError(`Failed to save to backend: ${err.message}. Saved locally.`);
    }
  };

  const continueToNext = () => {
    saveMetadata();
    if (!error) navigate('/social');
  };

  const goBack = () => {
    saveMetadata();
    if (!error) navigate('/blog-editor');
  };

  return (
    <div className="metadata-container">
      <header className="mobile-header">
        <div className="header-content">
          <div className="navbar-title">
            <FaHome className="home-icon" aria-hidden="true" />
            <span>Metadata</span>
          </div>
          <button 
            className="menu-toggle" 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle navigation menu"
          >
            {sidebarOpen ? <FaTimes aria-hidden="true" /> : <FaTags aria-hidden="true" />}
          </button>
        </div>
      </header>

      <Sidebar isOpen={sidebarOpen} toggleSidebar={() => setSidebarOpen(false)} />
      
      <div className={`metadata-content ${sidebarOpen ? 'sidebar-active' : ''}`}>
        <div className="glass-card">
          <header className="metadata-header">
            <h1 className="metadata-title">
              Metadata Optimization
            </h1>
            <p className="metadata-subtitle">
              Enhance your content's visibility with optimized metadata
            </p>
          </header>

          {error && (
            <div className="error-message" role="alert">
              <FaExclamationCircle aria-hidden="true" />
              <span>{error}</span>
              <button 
                onClick={() => setError('')} 
                className="close-error" 
                aria-label="Dismiss error message"
              >
                <FaTimes aria-hidden="true" />
              </button>
            </div>
          )}

          <div className="metadata-grid">
            <div className="metadata-form">
              <div className="meta-field">
                <label className="input-label" htmlFor="meta-title">
                  <FaHeading className="input-icon" aria-hidden="true" />
                  <span>Meta Title</span>
                  <span className="char-counter">{title.length}/60 (ideal: 50-60 chars)</span>
                </label>
                <input
                  id="meta-title"
                  type="text"
                  className="input-field"
                  value={title}
                  onChange={(e) => setTitle(e.target.value.trimStart())}
                  placeholder="Enter a compelling title"
                  maxLength="60"
                  aria-label="Meta title (50-60 characters)"
                />
              </div>

              <div className="meta-field">
                <label className="input-label" htmlFor="meta-description">
                  <FaAlignLeft className="input-icon" aria-hidden="true" />
                  <span>Meta Description</span>
                  <span className="char-counter">{description.length}/160 (ideal: 120-160 chars)</span>
                </label>
                <textarea
                  id="meta-description"
                  className="input-field"
                  value={description}
                  onChange={(e) => setDescription(e.target.value.trimStart())}
                  placeholder="Enter an engaging summary"
                  maxLength="160"
                  rows="4"
                  aria-label="Meta description (120-160 characters)"
                />
              </div>

              <div className="meta-field">
                <label className="input-label" htmlFor="tag-input">
                  <FaPlus className="input-icon" aria-hidden="true" />
                  <span>Tags</span>
                  <span className="char-counter">{tags.length}/10 max</span>
                </label>
                <div className="tag-input-container">
                  <input
                    id="tag-input"
                    type="text"
                    className="input-field"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value.trimStart())}
                    onKeyDown={addTag}
                    placeholder="Add tag and press Enter"
                    aria-label="Add a tag (press Enter to submit)"
                  />
                  <button 
                    onClick={addTag}
                    className="add-tag-button"
                    disabled={!tagInput.trim() || tags.length >= 10}
                    aria-label="Add tag"
                  >
                    Add
                  </button>
                </div>
                
                {tags.length > 0 && (
                  <div className="tags-container">
                    {tags.map((tag, index) => (
                      <span key={index} className="tag-chip">
                        {tag}
                        <button 
                          onClick={() => removeTag(tag)}
                          className="tag-remove"
                          aria-label={`Remove tag ${tag}`}
                        >
                          <FaTrashAlt size={12} aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="metadata-sidebar">
              <div className="seo-score-card">
                <div className="score-header">
                  <FaChartLine className="score-icon" aria-hidden="true" />
                  <h3>SEO Score</h3>
                </div>
                <div 
                  className="score-circle"
                  style={{ 
                    '--seoScore': `${seoScore}%`
                  }}
                >
                  <div className="score-value">{seoScore}%</div>
                </div>
                <div className="score-description">
                  {seoScore >= 80 ? 'Excellent' : 
                   seoScore >= 50 ? 'Good' : 
                   'Needs work'}
                </div>

                <div className="seo-tips">
                  <div className="tips-header">
                    <FaLightbulb className="tips-icon" aria-hidden="true" />
                    <h4>Optimization Tips</h4>
                  </div>
                  <ul className="tips-list">
                    {title.length < 50 && (
                      <li className="tip-item">
                        <span className="tip-badge">!</span>
                        Make title longer (50-60 chars ideal)
                      </li>
                    )}
                    {title.length > 60 && (
                      <li className="tip-item">
                        <span className="tip-badge">!</span>
                        Shorten title (under 60 chars)
                      </li>
                    )}
                    {description.length < 120 && (
                      <li className="tip-item">
                        <span className="tip-badge">!</span>
                        Expand description (120-160 chars)
                      </li>
                    )}
                    {tags.length < 3 && (
                      <li className="tip-item">
                        <span className="tip-badge">!</span>
                        Add more tags (3-5 recommended)
                      </li>
                    )}
                    {tags.length > 0 && !title.toLowerCase().includes(tags[0]) && (
                      <li className="tip-item">
                        <span className="tip-badge">!</span>
                        Include primary tag in title
                      </li>
                    )}
                  </ul>
                </div>

                {suggestedTags.length > 0 && (
                  <div className="suggested-tags">
                    <h4>Suggested Tags</h4>
                    <div className="suggested-tags-grid">
                      {suggestedTags.map((tag, index) => (
                        <button
                          key={index}
                          className="suggested-tag"
                          onClick={() => addSuggestedTag(tag)}
                          aria-label={`Add suggested tag ${tag}`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="metadata-actions">
            <button 
              className="secondary-button"
              onClick={goBack}
              aria-label="Go back to editor"
            >
              <FaArrowLeft aria-hidden="true" /> Back to Editor
            </button>
            <div className="action-group">
              <button 
                className="save-button"
                onClick={saveMetadata}
                aria-label={isSaved ? 'Draft saved' : 'Save draft'}
              >
                {isSaved ? 'Saved!' : 'Save Draft'} <FaSave aria-hidden="true" />
              </button>
              <button 
                className="primary-button"
                onClick={continueToNext}
                aria-label="Continue to social snippets"
              >
                Continue <FaArrowRight aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Metadata;