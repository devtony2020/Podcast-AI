import { Client, Databases } from 'appwrite';

const client = new Client()
    .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT)
    .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID);

export const databases = new Databases(client);
export const DATABASE_ID = 'bytebao_db';
export const COLLECTIONS = {
    TRANSCRIPTS: 'transcripts',
    BLOG_POSTS: 'blog_posts',
    SNIPPETS: 'snippets',
    PUBLISH_QUEUE: 'publish_queue',
};