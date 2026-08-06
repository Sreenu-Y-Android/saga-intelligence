const { google } = require('googleapis');
const moment = require('moment');

class YouTubeService {
    constructor() {
        this.quotaUsed = 0;
        this.quotaLimit = 10000; // Default daily limit
    }

    getClient() {
        const apiKey = String(process.env.YOUTUBE_API_KEY || '').trim();
        if (!apiKey) {
            throw new Error('YOUTUBE_API_KEY is not configured');
        }

        return google.youtube({
            version: 'v3',
            auth: apiKey
        });
    }

    // --- Channel Methods ---

    async getChannelDetails(channelId) {
        try {
            const youtube = this.getClient();
            const response = await youtube.channels.list({
                part: ['snippet', 'statistics', 'brandingSettings', 'contentDetails'],
                id: [channelId]
            });

            if (!response.data.items || response.data.items.length === 0) {
                throw new Error('Channel not found');
            }

            const channel = response.data.items[0];
            
            const stats = channel.statistics || {};
            
            return {
                id: channel.id,
                title: channel.snippet.title,
                description: channel.snippet.description,
                customUrl: channel.snippet.customUrl,
                publishedAt: channel.snippet.publishedAt,
                thumbnails: channel.snippet.thumbnails,
                statistics: {
                    viewCount: parseInt(stats.viewCount || '0', 10),
                    subscriberCount: parseInt(stats.subscriberCount || '0', 10),
                    hiddenSubscriberCount: stats.hiddenSubscriberCount || false,
                    videoCount: parseInt(stats.videoCount || '0', 10)
                },
                brandingSettings: channel.brandingSettings,
                uploadsPlaylistId: channel.contentDetails.relatedPlaylists.uploads,
                country: channel.snippet.country
            };
        } catch (error) {
            console.error('Error fetching channel details:', error);
            throw error;
        }
    }

    async searchChannels(query) {
        try {
            const youtube = this.getClient();
            const response = await youtube.search.list({
                part: ['snippet'],
                q: query,
                type: 'channel',
                maxResults: 10
            });

            return response.data.items.map(item => ({
                id: item.snippet.channelId,
                title: item.snippet.title,
                description: item.snippet.description,
                thumbnails: item.snippet.thumbnails,
                publishedAt: item.snippet.publishedAt
            }));
        } catch (error) {
            console.error('Error searching channels:', error);
            throw error;
        }
    }

    async searchVideos(query) {
        try {
            const youtube = this.getClient();
            const ytMax = Math.max(1, Math.min(50, parseInt(process.env.YT_SEARCH_PAGE_SIZE || '50', 10)));
            const response = await youtube.search.list({
                part: ['snippet'],
                q: query,
                type: 'video',
                maxResults: ytMax
            });

            const videoIds = response.data.items.map(item => item.id.videoId);
            return await this.getVideoDetails(videoIds);
        } catch (error) {
            console.error('Error searching videos:', error);
            throw error;
        }
    }

    // --- Video Methods ---

    async getVideosFromPlaylist(playlistId, maxResults = 50) {
        try {
            const youtube = this.getClient();
            const response = await youtube.playlistItems.list({
                part: ['snippet', 'contentDetails'],
                playlistId: playlistId,
                maxResults: maxResults
            });

            const videoIds = response.data.items.map(item => item.contentDetails.videoId);
            return await this.getVideoDetails(videoIds);
        } catch (error) {
            console.error('Error fetching playlist videos:', error);
            throw error;
        }
    }


    async getVideoDetails(videoIds) {
        const youtube = this.getClient();

        // Process in chunks of 50
        const chunks = [];
        for (let i = 0; i < videoIds.length; i += 50) {
            chunks.push(videoIds.slice(i, i + 50));
        }

        let allVideos = [];
        for (const chunk of chunks) {
            try {
                const response = await youtube.videos.list({
                    part: ['snippet', 'contentDetails', 'statistics'],
                    id: chunk
                });
                allVideos = allVideos.concat(response.data.items);
            } catch (error) {
                console.error('Error fetching video details chunk:', error);
            }
        }

        return allVideos.map(video => ({
            id: video.id,
            title: video.snippet.title,
            description: video.snippet.description,
            publishedAt: video.snippet.publishedAt,
            thumbnails: video.snippet.thumbnails,
            channelId: video.snippet.channelId,
            channelTitle: video.snippet.channelTitle,
            tags: video.snippet.tags || [],
            categoryId: video.snippet.categoryId,
            duration: video.contentDetails.duration,
            statistics: {
                viewCount: parseInt(video.statistics.viewCount || 0),
                likeCount: parseInt(video.statistics.likeCount || 0),
                commentCount: parseInt(video.statistics.commentCount || 0)
            }
        }));
    }

    // --- Comment Methods ---

    async getVideoComments(videoId, maxResults = 100) {
        try {
            const youtube = this.getClient();
            const response = await youtube.commentThreads.list({
                part: ['snippet', 'replies'],
                videoId: videoId,
                maxResults: maxResults, // Note: max is 100 for this endpoint
                textFormat: 'plainText'
            });

            return response.data.items.map(item => {
                const topLevel = item.snippet.topLevelComment.snippet;
                const replies = item.replies ? item.replies.comments.map(reply => this._formatComment(reply.snippet, reply.id)) : [];

                return {
                    ...this._formatComment(topLevel, item.id),
                    replyCount: item.snippet.totalReplyCount,
                    replies: replies
                };
            });

        } catch (error) {
            // If comments are disabled, 403 error might occur, handle gracefully
            if (error.code === 403) {
                console.warn(`Comments disabled or restricted for video ${videoId}`);
                return [];
            }
            console.error(`Error fetching comments for video ${videoId}:`, error);
            throw error;
        }
    }

    _formatComment(snippet, id) {
        return {
            id: id,
            videoId: snippet.videoId,
            textDisplay: snippet.textDisplay,
            authorDisplayName: snippet.authorDisplayName,
            authorProfileImageUrl: snippet.authorProfileImageUrl,
            authorChannelId: snippet.authorChannelId?.value,
            likeCount: snippet.likeCount,
            publishedAt: snippet.publishedAt,
            updatedAt: snippet.updatedAt,
            parentId: snippet.parentId || null
        };
    }
}

module.exports = new YouTubeService();
