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

  // Load saved data
  useEffect(() => {
    const savedProject = JSON.parse(localStorage.getItem('currentProject')) || {};
    if (savedProject.metadata) {
      setTitle(savedProject.metadata.title || '');
      setDescription(savedProject.metadata.description || '');
      setTags(savedProject.metadata.tags || []);
    } else if (savedProject.title) {
      setTitle(savedProject.title);
      setDescription(`Listen to this podcast episode about ${savedProject.keywords?.join(', ') || 'interesting topics'}. ${savedProject.content?.substring(0, 100) || ''}...`);
      setTags(savedProject.keywords || []);
    }

    setSuggestedTags([
      'podcast',
      'content creation',
      ...(tags.length > 0 ? [] : ['seo', 'blogging', 'audio content'])
    ].filter(tag => !tags.includes(tag)));
  }, [tags]);

  // Calculate SEO score
  useEffect(() => {
    const score = Math.min(100, 
      (title.length > 10 && title.length <= 60 ? 30 : title.length * 0.5) +
      (description.length > 50 && description.length <= 160 ? 30 : description.length * 0.2) +
      (tags.length >= 3 ? 20 : tags.length * 5) +
      (tags.some(tag => title.includes(tag)) ? 10 : 0) +
      (tags.some(tag => description.includes(tag)) ? 10 : 0)
    );
    setSeoScore(Math.round(score));
  }, [title, description, tags]);

  const addTag = (e) => {
    if ((e.key === 'Enter' || e.type === 'click') && tagInput.trim() && !tags.includes(tagInput.trim().toLowerCase())) {
      setTags([...tags, tagInput.trim().toLowerCase()]);
      setTagInput('');
      setSuggestedTags(suggestedTags.filter(tag => tag !== tagInput.trim().toLowerCase()));
    }
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const addSuggestedTag = (tag) => {
    if (!tags.includes(tag)) {
      setTags([...tags, tag]);
      setSuggestedTags(suggestedTags.filter(t => t !== tag));
    }
  };

  const saveMetadata = () => {
    const projectData = JSON.parse(localStorage.getItem('currentProject')) || {};
    projectData.metadata = {
      title,
      description,
      tags,
      seoScore,
      lastUpdated: new Date().toISOString()
    };
    localStorage.setItem('currentProject', JSON.stringify(projectData));
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const continueToNext = () => {
    saveMetadata();
    navigate('/social-snippets');
  };

  const goBack = () => {
    navigate('/blog-editor');
  };

  const getSeoColor = () => {
    if (seoScore >= 80) return '#4CAF50';
    if (seoScore >= 50) return '#FFC107';
    return '#F44336';
  };

  return (
    <div className="metadata-container">
      {/* Header with left title and right menu button */}
      <header className="mobile-header">
        <div className="header-content">
          <div className="navbar-title">
            <FaHome className="home-icon" />
            <span>Metadata</span>
          </div>
          <button 
            className="menu-toggle" 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle menu"
          >
            {sidebarOpen ? <FaTimes /> : <FaTags />}
          </button>
        </div>
      </header>

      <Sidebar isOpen={sidebarOpen} />
      
      <div className={`metadata-content ${sidebarOpen ? 'sidebar-active' : ''}`}>
        <div className="glass-card">
          <header className="metadata-header">
            <h1 className="metadata-title">
              <span className="gradient-text"><br></br><br></br>Metadata Optimization</span>
            </h1>
            <p className="metadata-subtitle">
              Enhance your content's visibility with optimized metadata
            </p>
          </header>

          <div className="metadata-grid">
            <div className="metadata-form">
              <div className="meta-field">
                <label className="input-label">
                  <FaHeading className="input-icon" />
                  <span>Meta Title</span>
                  <span className="char-counter">
                    {title.length}/60 (ideal: 50-60 chars)
                  </span>
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="A compelling title that includes primary keywords"
                  maxLength="60"
                />
              </div>

              <div className="meta-field">
                <label className="input-label">
                  <FaAlignLeft className="input-icon" />
                  <span>Meta Description</span>
                  <span className="char-counter">
                    {description.length}/160 (ideal: 120-160 chars)
                  </span>
                </label>
                <textarea
                  className="input-field"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="An engaging summary that encourages clicks"
                  maxLength="160"
                  rows="4"
                />
              </div>

              <div className="meta-field">
                <label className="input-label">
                  <FaPlus className="input-icon" />
                  <span>Tags</span>
                  <span className="char-counter">{tags.length}/10 max</span>
                </label>
                <div className="tag-input-container">
                  <input
                    type="text"
                    className="input-field"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={addTag}
                    placeholder="Add tag and press Enter"
                  />
                  <button 
                    onClick={addTag}
                    className="add-tag-button"
                    disabled={!tagInput.trim() || tags.length >= 10}
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
                          aria-label={`Remove ${tag}`}
                        >
                          <FaTrashAlt size={12} />
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
                  <FaChartLine className="score-icon" />
                  <h3>SEO Score</h3>
                </div>
                <div 
                  className="score-circle"
                  style={{ 
                    background: `conic-gradient(${getSeoColor()} 0% ${seoScore}%, rgba(255,255,255,0.1) ${seoScore}% 100%)`
                  }}
                >
                  <div className="score-value">{seoScore}%</div>
                </div>
                <div className="score-description">
                  {seoScore >= 80 ? 'Excellent!' : 
                   seoScore >= 50 ? 'Good, but could improve' : 
                   'Needs work'}
                </div>

                <div className="seo-tips">
                  <div className="tips-header">
                    <FaLightbulb className="tips-icon" />
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
                    {tags.length > 0 && !title.includes(tags[0]) && (
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
            >
              <FaArrowLeft /> Back to Editor
            </button>
            <div className="action-group">
              <button 
                className="save-button"
                onClick={saveMetadata}
              >
                {isSaved ? 'Saved!' : 'Save Draft'}
              </button>
              <button 
                className="primary-button"
                onClick={continueToNext}
              >
                Continue <FaArrowRight />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Metadata;