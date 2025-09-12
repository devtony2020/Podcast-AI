import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/Sidebar/Sidebar";
import {
  FaCloudUploadAlt,
  FaFileAudio,
  FaExclamationCircle,
  FaTimes,
  FaSpinner,
  FaCheckCircle,
  FaMagic,
  FaHeadphones,
  FaRegClock,
  FaBars,
  FaUpload,
} from "react-icons/fa";
import { uploadAndProcessFile } from "../../api";
import "./upload.css";

const Upload = () => {
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("idle");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const handleDrop = (e) => {
    e.preventDefault();
    const newFiles = Array.from(e.dataTransfer.files);
    handleFiles(newFiles);
  };

  const handleChange = (e) => {
    const newFiles = Array.from(e.target.files);
    handleFiles(newFiles);
  };

  const handleFiles = (newFiles) => {
    if (newFiles.length === 0) return;
    const file = newFiles[0];

    const validTypes = [
      "audio/mpeg",
      "audio/wav",
      "video/mp4",
      "audio/m4a",
      "audio/aac",
      "audio/x-m4a",
      "video/quicktime",
      "audio/mp4",
      "audio/x-wav",
    ];

    if (!validTypes.includes(file.type) || file.size > 30 * 1024 * 1024) {
      setError(
        "Unsupported file type or size exceeds 30MB. Please use MP3, WAV, MP4, M4A, or AAC."
      );
      setFiles([]);
      return;
    }

    setFiles([file]);
    setError("");
  };

  const processFile = async () => {
    if (files.length === 0) return;

    setStatus("uploading");
    setProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 500);

      const result = await uploadAndProcessFile(files[0]);

      clearInterval(progressInterval);
      setProgress(100);
      setStatus("success");

      localStorage.setItem(
        "currentProject",
        JSON.stringify({
          episodeId: result.episodeId,
          originalFile: files[0].name,
          createdAt: new Date().toISOString(),
          fileUrl: result.fileUrl,
        })
      );

      setTimeout(() => navigate(`/blog/${result.episodeId}`), 1500);
    } catch (err) {
      console.error("Upload error:", err);
      setStatus("error");
      setError(err.message || "Upload failed. Please try again.");
      setProgress(0);
    }
  };

  const removeFile = () => {
    setFiles([]);
    setProgress(0);
    setStatus("idle");
    setError("");
  };

  return (
    <div className="upload-page">
      <header className="mobile-header">
        <div className="header-content">
          <div className="navbar-title">
            <FaUpload className="upload-icon" aria-hidden="true" />
            <span>Upload</span>
          </div>
          <button
            className="menu-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle navigation menu"
          >
            {sidebarOpen ? <FaTimes aria-hidden="true" /> : <FaBars aria-hidden="true" />}
          </button>
        </div>
      </header>

      <Sidebar isOpen={sidebarOpen} toggleSidebar={() => setSidebarOpen(false)} />

      <main className={`upload-main ${sidebarOpen ? "sidebar-active" : ""}`}>
        <div className="upload-container">
          <div className="upload-card">
            <header className="upload-header">
              <h1 className="upload-title">
                Transform Your Podcast Into Engaging Content
              </h1>
              <p className="upload-subtitle">
                Upload your audio or video and let our AI create blog posts, show notes, and more.
              </p>
            </header>

            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon" aria-hidden="true">
                  <FaMagic />
                </div>
                <h3>AI-Powered</h3>
                <p>Smart transcription with speaker detection</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon" aria-hidden="true">
                  <FaHeadphones />
                </div>
                <h3>Multi-Format</h3>
                <p>Supports MP3, WAV, MP4, and more</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon" aria-hidden="true">
                  <FaRegClock />
                </div>
                <h3>Fast Processing</h3>
                <p>Get results in minutes, not hours</p>
              </div>
            </div>

            <div
              className={`upload-zone ${error ? "has-error" : ""} ${
                status === "success" ? "has-success" : ""
              }`}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              role="region"
              aria-label="File upload area"
            >
              {status === "success" ? (
                <div className="upload-success-content">
                  <FaCheckCircle size={40} className="success-icon" aria-hidden="true" />
                  <h3>All Set! Your Content is Ready</h3>
                  <p>Preparing your editor experience...</p>
                  <div className="success-progress">
                    <div
                      className="progress-bar"
                      style={{ width: `${progress}%` }}
                      role="progressbar"
                      aria-valuenow={progress}
                      aria-valuemin="0"
                      aria-valuemax="100"
                    ></div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="upload-icon-container">
                    <FaCloudUploadAlt className="upload-icon" size={40} aria-hidden="true" />
                    <div className="upload-icon-shadow"></div>
                  </div>
                  <h3>Drag & Drop Your File Here</h3>
                  <p className="upload-hint">
                    We support MP3, MP4, WAV files up to 30MB
                  </p>
                  <span className="upload-or">or</span>
                  <label className="upload-label" htmlFor="file-upload">
                    <span>Browse Files</span>
                    <input
                      id="file-upload"
                      type="file"
                      accept=".mp3,.mp4,.wav,.m4a,.aac,.mov,.qt"
                      className="upload-input"
                      onChange={handleChange}
                      disabled={status !== "idle"}
                      aria-label="Upload audio or video file"
                    />
                  </label>
                </>
              )}
            </div>

            {error && (
              <div className="upload-message error" role="alert">
                <FaExclamationCircle aria-hidden="true" />
                <span>{error}</span>
                <button
                  className="dismiss-error"
                  onClick={() => setError("")}
                  aria-label="Dismiss error message"
                >
                  <FaTimes aria-hidden="true" />
                </button>
              </div>
            )}

            {files.length > 0 && status !== "success" && (
              <div className="file-list">
                <h2 className="file-list-title">Selected File</h2>
                <div className="file-item">
                  <div className="file-icon" aria-hidden="true">
                    <FaFileAudio />
                  </div>
                  <div className="file-info">
                    <span className="file-name">{files[0].name}</span>
                    <span className="file-details">
                      {(files[0].size / 1024 / 1024).toFixed(2)} MB •{" "}
                      {files[0].type.split("/")[1].toUpperCase()}
                    </span>
                  </div>
                  <button
                    className="remove-btn"
                    onClick={removeFile}
                    aria-label={`Remove ${files[0].name}`}
                    disabled={status !== "idle"}
                  >
                    <FaTimes aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}

            {progress > 0 && status !== "success" && (
              <div className="progress-container">
                <div className="progress-labels">
                  <span>
                    {status === "uploading" ? "Uploading..." : "Processing..."}
                  </span>
                  <span>{progress}%</span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-bar"
                    style={{ width: `${progress}%` }}
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin="0"
                    aria-valuemax="100"
                  ></div>
                </div>
              </div>
            )}

            <button
              className={`upload-btn ${status !== "idle" ? "processing" : ""}`}
              disabled={files.length === 0 || status !== "idle"}
              onClick={processFile}
              aria-label="Transcribe and generate content"
            >
              {status === "idle" ? (
                <>
                  <FaCloudUploadAlt aria-hidden="true" />
                  <span>Transcribe & Generate Content</span>
                </>
              ) : (
                <>
                  <FaSpinner className="spinner" aria-hidden="true" />
                  <span>
                    {status === "uploading" ? "Uploading..." : "Processing..."}
                  </span>
                </>
              )}
            </button>

            <div className="upload-footer">
              <p>
                By uploading, you agree to our{" "}
                <a href="#" aria-label="Terms of Service">
                  Terms of Service
                </a>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Upload;