import { RedisClient } from '@devvit/redis';
import { Caption, CaptionWithUpvotes } from '../../shared/types/caption.type';
import { randomUUID } from 'node:crypto';

// Redis key builders
const keys = {
  captions: (postId: string) => `post:${postId}:captions`,
  caption: (postId: string, captionId: string) => `post:${postId}:captions:${captionId}`,
  upvotes: (postId: string, captionId: string) => `post:${postId}:captions:${captionId}:upvotes`,
  post: (postId: string) => `post:${postId}`,
} as const;

// Redis data transformation utilities
type RedisDataType = Record<string, string>;

function toRedisDataType(caption: Caption): RedisDataType {
  return {
    id: caption.id || '',
    username: caption.username,
    topExtendedCaption: caption.topExtendedCaption || '',
    bottomExtendedCaption: caption.bottomExtendedCaption || '',
    topCaption: caption.topCaption || '',
    bottomCaption: caption.bottomCaption || '',
    topExtensionWhite: caption.topExtensionWhite ? 'true' : 'false',
    bottomExtensionWhite: caption.bottomExtensionWhite ? 'true' : 'false',
    createdAt: caption.createdAt.toString(),
  };
}

function fromRedisDataType(redisData: RedisDataType): Caption {
  return {
    id: redisData.id || undefined,
    username: redisData.username!,
    topExtendedCaption: redisData.topExtendedCaption || undefined,
    bottomExtendedCaption: redisData.bottomExtendedCaption || undefined,
    topCaption: redisData.topCaption || undefined,
    bottomCaption: redisData.bottomCaption || undefined,
    topExtensionWhite: redisData.topExtensionWhite === 'true' ? true : undefined,
    bottomExtensionWhite: redisData.bottomExtensionWhite === 'true' ? true : undefined,
    createdAt: parseInt(redisData.createdAt!, 10),
  };
}

export class CaptionsServices {

  /**
   * Creates a new caption for a post (for server calls)
   */
  static async createCaption(
    redis: RedisClient,
    postId: string,
    caption: Caption
  ): Promise<Caption> {
    try {
      // Check if post exists
      const postExists = await redis.exists(keys.post(postId));
      if (!postExists) {
        throw new Error(`Post ${postId} does not exist`);
      }

      // Generate random UUID for caption
      const captionId = randomUUID();
      const captionWithId: Caption = { ...caption, id: captionId };

      // Save caption to Redis
      const captionKey = keys.caption(postId, captionId);
      await redis.hSet(captionKey, toRedisDataType(captionWithId));

      // Add caption to sorted set for counting (score = 0 initially)
      const captionsKey = keys.captions(postId);
      await redis.zAdd(captionsKey, { member: captionId, score: 0 });

      // Initialize upvotes with the caption author (score = 1)
      const upvotesKey = keys.upvotes(postId, captionId);
      await redis.zAdd(upvotesKey, { member: caption.username, score: 1 });

      return captionWithId;
    } catch (error) {
      console.error(`Error creating caption for post ${postId}:`, error);
      throw new Error(`Failed to create caption: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Upvotes or removes upvote from a caption (for server calls)
   */
  static async upvoteCaption(
    redis: RedisClient,
    postId: string,
    captionId: string,
    username: string
  ): Promise<boolean> {
    try {
      // Check if caption exists
      const captionKey = keys.caption(postId, captionId);
      const captionExists = await redis.exists(captionKey);
      if (!captionExists) {
        throw new Error(`Caption ${captionId} does not exist`);
      }

      const upvotesKey = keys.upvotes(postId, captionId);

      // Get current upvotes list
      const upvotesList = await redis.zRange(upvotesKey, 0, -1);
      const userHasUpvoted = upvotesList.some(item => item.member === username);

      let userUpvoted: boolean;

      if (userHasUpvoted) {
        // Remove upvote
        await redis.zRem(upvotesKey, [username]);
        userUpvoted = false;
      } else {
        // Add upvote
        await redis.zAdd(upvotesKey, { member: username, score: 1 });
        userUpvoted = true;
      }

      // Update caption score in main captions sorted set
      const upvoteCount = await redis.zCard(upvotesKey);
      const captionsKey = keys.captions(postId);
      await redis.zAdd(captionsKey, { member: captionId, score: upvoteCount });

      return userUpvoted;
    } catch (error) {
      console.error(`Error upvoting caption ${captionId} for post ${postId}:`, error);
      throw new Error(`Failed to upvote caption: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gets all captions with upvote information for a specific user (for server calls)
   */
  static async getCaptionsWithUpvotes(
    redis: RedisClient,
    postId: string,
    username: string
  ): Promise<CaptionWithUpvotes[]> {
    try {
      const captionsKey = keys.captions(postId);
      const captionItems = await redis.zRange(captionsKey, 0, -1);

      const captionsWithUpvotes: CaptionWithUpvotes[] = [];

      for (const item of captionItems) {
        try {
          const captionId = item.member;

          // Get caption data
          const captionKey = keys.caption(postId, captionId);
          const captionData = await redis.hGetAll(captionKey);

          if (!captionData || Object.keys(captionData).length === 0) {
            continue;
          }

          const caption = fromRedisDataType(captionData);

          // Get upvotes information
          const upvotesKey = keys.upvotes(postId, captionId);
          const upvotesList = await redis.zRange(upvotesKey, 0, -1);
          const upvotes = upvotesList.length;
          const userUpvoted = upvotesList.some((item) => item.member === username);

          captionsWithUpvotes.push({
            ...caption,
            upvotes,
            userUpvoted,
          });
        } catch (error) {
          console.error(`Error processing caption ${item.member}:`, error);
        }
      }

      return captionsWithUpvotes;
    } catch (error) {
      console.error(`Error getting captions with upvotes for post ${postId}:`, error);
      throw new Error(`Failed to get captions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gets the top 3 captions by upvotes (for Devvit component calls)
   */
  static async getTopCaptions(redis: RedisClient, postId: string): Promise<Caption[]> {
    try {
      const captionsKey = keys.captions(postId);

      // Get total count and calculate start index for top 3
      const totalCount = await redis.zCard(captionsKey);
      const startIndex = Math.max(0, totalCount - 3);
      const endIndex = totalCount - 1;

      // Get top 3 captions (highest scores last, so we get the last 3)
      const topCaptionItems = await redis.zRange(captionsKey, startIndex, endIndex);

      // Reverse to get highest scores first
      topCaptionItems.reverse();

      const topCaptions: Caption[] = [];

      for (const item of topCaptionItems) {
        try {
          const captionId = item.member;

          // Get caption data
          const captionKey = keys.caption(postId, captionId);
          const captionData = await redis.hGetAll(captionKey);

          if (!captionData || Object.keys(captionData).length === 0) {
            continue;
          }

          const caption = fromRedisDataType(captionData);
          topCaptions.push(caption);
        } catch (error) {
          console.error(`Error processing top caption ${item.member}:`, error);
          continue;
        }
      }

      return topCaptions;
    } catch (error) {
      console.error(`Error getting top captions for post ${postId}:`, error);
      throw new Error(`Failed to get top captions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Purges all captions and upvotes for a post (for Devvit component calls)
   */
  static async purgeCaptionsAndUpvotes(redis: RedisClient, postId: string): Promise<void> {
    try {
      const captionsKey = keys.captions(postId);

      // Get all captions
      const captionItems = await redis.zRange(captionsKey, 0, -1);

      // Delete each caption and its upvotes
      for (const captionItem of captionItems) {
        const captionId = captionItem.member;
        try {
          const captionKey = keys.caption(postId, captionId);
          const upvotesKey = keys.upvotes(postId, captionId);

          // Delete caption data and upvotes
          await redis.del(captionKey);
          await redis.del(upvotesKey);
        } catch (error) {
          console.error(`Error deleting caption ${captionId}:`, error);
        }
      }

      // Delete the main captions sorted set
      await redis.del(captionsKey);
    } catch (error) {
      console.error(`Error purging captions and upvotes for post ${postId} from Devvit:`, error);
      throw new Error(`Failed to purge captions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
