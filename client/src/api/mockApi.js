/**
 * Mock transcription service
 * Simulates OpenAI Whisper API response
 */
export const transcribeFile = (file) => {
    return new Promise((resolve) => {
      // Simulate processing delay (2-5 seconds)
      const delay = 2000 + Math.random() * 3000;
      
      setTimeout(() => {
        resolve({
          text: `This is a mock transcription of your file: ${file.name}\n\n` +
            "Welcome to the Tech Podcast. Today we're discussing AI tools that can convert " +
            "podcasts into blog posts automatically. This technology uses speech-to-text " +
            "algorithms followed by natural language processing to create readable content.\n\n" +
            "The key benefits include time savings, content repurposing, and improved SEO. " +
            "Many creators are now using tools like this to maximize their content reach.",
          segments: [
            { start: 0, end: 4.5, text: "Welcome to the Tech Podcast." },
            { start: 4.5, end: 10.2, text: "Today we're discussing AI tools..." },
            { start: 10.2, end: 25.7, text: "This technology uses speech-to-text..." }
          ],
          language: "en",
          duration: 180 // Mock duration in seconds
        });
      }, delay);
    });
  };
  
  export const checkFileRequirements = (file) => {
    const validTypes = ['audio/mpeg', 'video/mp4', 'audio/wav'];
    const maxSize = 100 * 1024 * 1024; // 100MB
    
    return new Promise((resolve, reject) => {
      if (!validTypes.includes(file.type)) {
        reject(new Error("Invalid file type. Only MP3, MP4, and WAV are supported."));
      } else if (file.size > maxSize) {
        reject(new Error("File too large. Maximum size is 100MB."));
      } else {
        resolve(true);
      }
    });
  };